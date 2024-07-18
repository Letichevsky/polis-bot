const TOKEN = "7344846744:AAG4MNEmfT2Sim09FS-mLf0UDC_m0Cw6-zY";
const url =
  "mongodb+srv://vladislavletichevsky:52669007mongoDB@clusterpolisbot.nhyqzrq.mongodb.net/?retryWrites=true&w=majority&appName=ClusterPolisBot";

const { Telegraf } = require("telegraf");
const { MongoClient, ObjectId } = require("mongodb");

const bot = new Telegraf(TOKEN);

const client = new MongoClient(url);

client
  .connect()
  .then(() => {
    console.log("Connected to MongoDB");
    const db = client.db("car_insurance");
    const usersCollection = db.collection("users");
    const carsCollection = db.collection("cars");

    const userStates = new Map();

    bot.start((ctx) => {
      ctx.reply(
        "Привет! Я ваш бот по страхованию автомобилей. Готов помочь вам оформить полис за считанные минуты.",
        {
          reply_markup: {
            keyboard: [[{ text: "Старт" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    });

    bot.hears("Старт", (ctx) => {
      userStates.delete(ctx.from.id);
      ctx.reply("Выберите действие:", {
        reply_markup: {
          keyboard: [
            [{ text: "Мой гараж 🚘" }, { text: "Сделать полис 📃" }],
            [{ text: "Реферальная программа 🔗" }, { text: "Консультант 🧑‍💼" }],
            [{ text: "О нас ℹ️" }],
          ],
          resize_keyboard: true,
        },
      });
    });

    bot.hears("Мой гараж 🚘", async (ctx) => {
      const userId = ctx.from.id;
      const user = await usersCollection.findOne({ id: userId });

      if (user) {
        ctx.reply(
          `Имя пользователя: ${user.username}\nID пользователя: ${user.id}\nБаланс: ${user.balance} PLN\nПриглашенные: ${user.invited_count}`,
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
          invited_count: 0,
        });
        ctx.reply("Ваш гараж пуст. Добавьте автомобиль, чтобы продолжить.", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Добавить автомобиль", callback_data: "add_car" }],
            ],
          },
        });
      }
    });

    bot.hears("Сделать полис 📃", async (ctx) => {
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
    });

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
        ctx.reply("На какой срок сделать полис?", {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "1 месяц - 140 PLN",
                  callback_data: `buy_policy_1_month_${carId}`,
                },
              ],
              [
                {
                  text: "3 месяца - 390 PLN",
                  callback_data: `buy_policy_3_months_${carId}`,
                },
              ],
            ],
          },
        });
      } else if (data.startsWith("buy_policy_")) {
        const [_, duration, carId] = data.split("_");
        const cost = duration === "1_month" ? 140 : 390;

        // Fetch the updated user data
        const user = await usersCollection.findOne({ id: userId });

        // Log the user balance before the transaction
        console.log(
          `User ${userId} balance before transaction: ${user.balance}`
        );

        if (user.balance >= cost) {
          await usersCollection.updateOne(
            { id: userId },
            { $inc: { balance: -cost } }
          );

          // Fetch the user data again to log the updated balance
          const updatedUser = await usersCollection.findOne({ id: userId });

          // Log the user balance after the transaction
          console.log(
            `User ${userId} balance after transaction: ${updatedUser.balance}`
          );

          ctx.reply("Запрос принят, ожидайте свой полис.");
          // Заглушка для передачи данных в админку
          console.log(
            `Пользователь ${userId} выбрал автомобиль ${carId} и полис на ${duration}`
          );
        } else {
          ctx.reply("Недостаточно средств на балансе.", {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Пополнить баланс", callback_data: "add_balance" }],
              ],
            },
          });
        }
      } else if (data.startsWith("delete_car_")) {
        const carId = data.split("_")[2];
        await carsCollection.deleteOne({
          _id: ObjectId.createFromHexString(carId),
        });
        ctx.reply("Автомобиль удален из вашего гаража.");
      }
    });

    bot.on("text", async (ctx) => {
      const userId = ctx.from.id;
      const state = userStates.get(userId);

      if (state === "waiting_for_car_info") {
        const carInfo = ctx.message.text;
        await carsCollection.insertOne({
          user_id: userId,
          car_info: carInfo,
        });
        ctx.reply("Автомобиль добавлен в ваш гараж.");
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

          // Fetch the updated user data to ensure the balance is updated
          const updatedUser = await usersCollection.findOne({ id: userId });

          // Log the balance update
          console.log(
            `User ${userId} balance topped up by ${amount} PLN. New balance: ${updatedUser.balance}`
          );

          ctx.reply(`Ваш баланс пополнен на ${amount} PLN.`);
          userStates.delete(userId);
        }
      }
    });

    bot.launch();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
  });
