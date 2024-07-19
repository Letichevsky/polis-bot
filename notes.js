require("dotenv").config();
const { Telegraf } = require("telegraf");
const { MongoClient, ObjectId } = require("mongodb");

const TOKEN = process.env.TOKEN;
const url = process.env.MONGODB_URL;

const bot = new Telegraf(TOKEN);
const client = new MongoClient(url);

const priceList = [
  { duration: "1 месяц", cost: 140, callback_data: "buy_policy_1_month" },
  { duration: "3 месяца", cost: 390, callback_data: "buy_policy_3_months" },
  { duration: "6 месяцев", cost: 780, callback_data: "buy_policy_6_months" },
  { duration: "12 месяцев", cost: 1560, callback_data: "buy_policy_12_months" },
];

let canAnswer = false;

client
  .connect()
  .then(() => {
    console.log("Connected to MongoDB");

    const db = client.db("car_insurance");
    const usersCollection = db.collection("users");
    const carsCollection = db.collection("cars");

    const userStates = new Map();

    function formatDate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${day}.${month}.${year}`;
    }

    function getStartDate() {
      return new Date();
    }

    function getExpirationDate(startDate, monthsDuration) {
      const expirationDate = new Date(startDate);
      expirationDate.setMonth(expirationDate.getMonth() + monthsDuration);
      return expirationDate;
    }

    async function myGarage(ctx) {
      const userId = ctx.from.id;
      const user = await usersCollection.findOne({ id: userId });

      if (user) {
        ctx.reply(
          `Имя пользователя: ${user.username}\nID пользователя: ${user.id}\nБаланс: ${user.balance} PLN`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Добавить автомобиль", callback_data: "add_car" }],
                [{ text: "Пополнить баланс", callback_data: "add_balance" }],
              ],
            },
          }
        );

        const cars = await carsCollection.find({ user_id: userId }).toArray();
        cars.forEach((car) => {
          ctx.reply(`${car.car_info}`, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Посмотреть полисы",
                    callback_data: `view_policies_${car._id}`,
                  },
                ],
                [
                  {
                    text: "Удалить автомобиль",
                    callback_data: `delete_car_${car._id}`,
                  },
                ],
              ],
            },
          });
        });
      } else {
        await usersCollection.insertOne({
          id: userId,
          username: ctx.from.username,
          balance: 0,
        });
        ctx.reply("Ваш гараж пуст. Добавьте автомобиль, чтобы продолжить.", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Добавить автомобиль", callback_data: "add_car" }],
            ],
          },
        });
      }
      canAnswer = true;
    }

    async function createPolis(ctx) {
      const userId = ctx.from.id;
      const cars = await carsCollection.find({ user_id: userId }).toArray();

      if (cars.length === 0) {
        ctx.reply("Ваш гараж пуст. Добавьте автомобиль, чтобы продолжить.", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Добавить автомобиль", callback_data: "add_car" }],
            ],
          },
        });
      } else {
        const buttons = cars.map((car) => [
          {
            text: `Выбрать: ${car.car_info}`,
            callback_data: `select_car_${car._id}`,
          },
        ]);
        ctx.reply("Выберите автомобиль для полиса:", {
          reply_markup: {
            inline_keyboard: buttons,
          },
        });
      }
      canAnswer = true;
    }

    function support(ctx) {
      ctx.reply("Напишите в нашу службу поддержки @vlcontact");
      canAnswer = true;
    }

    function aboutUs(ctx) {
      ctx.reply(
        "Мы - самый удобный бот для покупки страхового полиса для вашего любимого автомобиля"
      );
      canAnswer = true;
    }

    function start(ctx) {
      userStates.delete(ctx.from.id);
      ctx.reply(
        "Привет! Я ваш бот по страхованию автомобилей. Готов помочь вам оформить полис за считанные минуты. \nВыберите действие:",
        {
          reply_markup: {
            keyboard: [
              [{ text: "Мой гараж 🚘" }, { text: "Сделать полис 📃" }],
              [{ text: "Консультант 🧑‍💼" }],
              [{ text: "О нас ℹ️" }],
            ],
            resize_keyboard: true,
          },
        }
      );
      canAnswer = true;
    }

    bot.start((ctx) => {
      start(ctx);
      console.log(ctx.message.text);
    });

    bot.hears("Мой гараж 🚘", (ctx) => {
      myGarage(ctx);
      console.log(ctx.message.text);
    });

    bot.hears("Сделать полис 📃", async (ctx) => {
      createPolis(ctx);
      console.log(ctx.message.text);
    });

    bot.hears("Консультант 🧑‍💼", async (ctx) => {
      support(ctx);
      console.log(ctx.message.text);
    });

    bot.hears("О нас ℹ️", async (ctx) => {
      aboutUs(ctx);
      console.log(ctx.message.text);
    });

    ////CALLBACK_QUERY
    bot.on("callback_query", async (ctx) => {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id;

      if (data === "add_car") {
        ctx.reply("Пожалуйста, отправьте информацию о вашем автомобиле.");
        userStates.set(userId, "waiting_for_car_info");
      } else if (data === "add_balance") {
        ctx.reply("Пожалуйста, введите сумму для пополнения баланса.");
        userStates.set(userId, "waiting_for_balance_amount");
      } else if (data.startsWith("select_car_")) {
        const carId = data.split("_")[2];
        userStates.set(userId, `waiting_for_policy_duration_${carId}`);

        const buttons = priceList.map((price) => [
          {
            text: `${price.duration} - ${price.cost} PLN`,
            callback_data: `${price.callback_data}_${carId}`,
          },
        ]);

        ctx.reply("На какой срок сделать полис?", {
          reply_markup: {
            inline_keyboard: buttons,
          },
        });
      } else if (data.startsWith("buy_policy_")) {
        const parts = data.split("_");
        const duration = `${parts[2]}_${parts[3]}`; // Скорректировано для захвата полного срока
        const carId = parts[4];
        const selectedPrice = priceList.find(
          (price) => price.callback_data === `buy_policy_${duration}`
        );
        const cost = selectedPrice ? selectedPrice.cost : null;

        if (cost === null) {
          ctx.reply("Произошла ошибка. Попробуйте снова.");
          return;
        }

        // Fetch the updated user data
        const user = await usersCollection.findOne({ id: userId });

        if (user.balance >= cost) {
          await usersCollection.updateOne(
            { id: userId },
            { $inc: { balance: -cost } }
          );

          const startDate = getStartDate();
          const expirationDate = getExpirationDate(
            startDate,
            parseInt(duration.split(" ")[0])
          );

          await carsCollection.updateOne(
            { _id: ObjectId.createFromHexString(carId) },
            {
              $push: {
                policies: {
                  isActive: true,
                  date_of_start: startDate,
                  date_of_expiration: expirationDate,
                },
              },
            }
          );

          const car = await carsCollection.findOne({
            _id: ObjectId.createFromHexString(carId),
          });

          ctx.reply("Запрос принят, ожидайте свой полис.");
          ctx.reply(
            `Admin \nПользователь @${user.username} заказал полис. \nАвтомобиль: ${car.car_info} \ncar ID: ${carId} \nСрок полиса в месяцах: ${duration}`
          );
          console.log(
            `Пользователь ${user.username} ID:${userId} заказал полис. \nАвтомобиль: ${car.car_info} \ncar ID: ${carId} \nСрок полиса в месяцах: ${duration}`
          );
        } else {
          ctx.reply(
            `Недостаточно средств на балансе. ваш баланс ${user.balance}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Пополнить баланс", callback_data: "add_balance" }],
                ],
              },
            }
          );
        }
      } else if (data.startsWith("delete_car_")) {
        const carId = data.split("_")[2];
        const car = await carsCollection.findOne({
          _id: ObjectId.createFromHexString(carId),
        });
        await carsCollection.deleteOne({
          _id: ObjectId.createFromHexString(carId),
        });
        ctx.reply(`Автомобиль ${car.car_info} удален из вашего гаража.`);
      } else if (data === "my_garage") {
        myGarage(ctx);
      } else if (data === "create_polis") {
        createPolis(ctx);
      } else if (data === "support") {
        support(ctx);
      } else if (data === "about_us") {
        aboutUs(ctx);
      } else if (data.startsWith("view_policies_")) {
        const carId = data.split("_")[2];
        const car = await carsCollection.findOne({
          _id: ObjectId.createFromHexString(carId),
        });

        if (car && car.policies && car.policies.length > 0) {
          car.policies.forEach((policy) => {
            const status = policy.isActive ? "Активный" : "Неактивный";
            const startDate = formatDate(new Date(policy.date_of_start));
            const expirationDate = formatDate(
              new Date(policy.date_of_expiration)
            );
            ctx.reply(
              `Статус: ${status}\nДата начала действия: ${startDate}\nДата истечения срока действия: ${expirationDate}`
            );
          });
        } else {
          ctx.reply("Полисы для данного автомобиля отсутствуют.");
        }
      }

      canAnswer = true;
    });

    bot.on("text", async (ctx) => {
      console.log(ctx.message.text);
      const userId = ctx.from.id;
      const state = userStates.get(userId);

      if (state === "waiting_for_car_info") {
        const carInfo = ctx.message.text;
        await carsCollection.insertOne({
          user_id: userId,
          car_info: carInfo,
          policies: [],
        });
        ctx.reply(`Автомобиль ${carInfo} добавлен в ваш гараж.`);
        userStates.delete(userId);
      } else if (state === "waiting_for_balance_amount") {
        const amount = parseInt(ctx.message.text, 10);
        if (isNaN(amount)) {
          ctx.reply("Пожалуйста, введите корректную сумму без грош.");
        } else {
          await usersCollection.updateOne(
            { id: userId },
            { $inc: { balance: amount } }
          );
          ctx.reply(`Ваш баланс пополнен на ${amount} PLN.`);
          userStates.delete(userId);
        }
      } else if (ctx.text.trim() && canAnswer) {
        ctx.reply("Пожалуйста выберите действие из списка:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Мой гараж 🚘", callback_data: "my_garage" }],
              [{ text: "Сделать полис 📃", callback_data: "create_polis" }],
              [{ text: "Консультант 🧑‍💼", callback_data: "support" }],
              [{ text: "О нас ℹ️", callback_data: "about_us" }],
            ],
          },
        });
      } else if (!canAnswer && ctx.message != "/start") {
        start(ctx);
      }
    });

    bot.launch();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
  });
