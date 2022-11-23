import {
  Message,
  Client,
  ApplicationCommandDataResolvable,
  MessageButton,
  MessageActionRow,
  MessageEmbed,
  ColorResolvable,
} from "discord.js";
import { fortuneComments } from "./fortuneComments";
import express from "express";
import axios from "axios";

import PgClient from "pg";
const pgClient = new PgClient.Client({
  user: process.env.PGUSER,
  password: process.env.PGPASS,
  host: process.env.PGHOST, // 詳細は後述
  database: process.env.PGDB,
  port: 5432,
  ssl: true,
});
pgClient.connect();

const token = process.env.TOKEN;
if (token === undefined) throw Error("token invalid");

const apiClient = axios.create({
  baseURL: "https://bcdice.onlinesession.app",
  headers: {
    "Content-Type": "application/json",
  },
});

const client = new Client({
  intents: ["GUILDS", "GUILD_MEMBERS", "GUILD_MESSAGES"],
});
const commandData: ApplicationCommandDataResolvable[] = [
  {
    name: "ping",
    description: "pong!",
  },
  {
    name: "fortune",
    description:
      "幸運(アカウント固有)と今日の幸運(3d6*5)の平均値で今日の運勢を占います",
  },
  {
    name: "commandrefresh",
    description: "コマンド一覧を更新します",
  },
  {
    name: "senka",
    description: "古戦場の箱目標から戦貨がいくつ必要かを計算します",
    options: [
      {
        type: "INTEGER",
        name: "nowbox",
        description: "今何箱目か",
        required: true,
      },
      {
        type: "INTEGER",
        name: "targetbox",
        description: "目標",
        required: true,
      },
      {
        type: "INTEGER",
        name: "balance",
        description: "現在の所持戦貨",
        required: true,
      },
    ],
  },
];
const ButtonData: { [index: string]: MessageActionRow } = {};

ButtonData.fortune = new MessageActionRow().addComponents(
  new MessageButton()
    .setCustomId("fortune")
    .setLabel("/fortune")
    .setStyle("PRIMARY")
);

client.once("ready", async () => {
  console.log(client.user?.tag);
  try {
    await client.application?.commands.set(commandData);
  } catch (e) {
    console.log(e);
  }
  console.log("Ready!");
});

client.on("interactionCreate", async (interaction) => {
  try {
    let commandName: string;
    if (interaction.isCommand()) {
      commandName = interaction.commandName;
    } else if (interaction.isButton()) {
      commandName = interaction.customId;
    } else {
      return;
    }
    // ping
    if (commandName === "ping") {
      await interaction.reply("pong!");
    }
    // fortune
    else if (commandName === "fortune") {
      let user = await pgClient.query(
        `select * from users where id='${interaction.user.id}'`
      );
      if (user.rows.length < 1) {
        await pgClient.query(
          `insert into users values ('${interaction.user.id}', 11, '2000-01-01 00:00:00+09'::TIMESTAMP WITH TIME ZONE, 11, ARRAY[0, 0, 0], 0, 'dummy')`
        );
        user = await pgClient.query(
          `select * from users where id='${interaction.user.id}'`
        );
      }
      const dbTimeStamp: Date = user.rows[0]["last_time"];
      const dbJSTTimeStamp = new Date(
        dbTimeStamp.getTime() +
          (dbTimeStamp.getTimezoneOffset() + 10 * 60) * 60 * 1000
      );
      const nowTimeStamp = new Date(
        Date.now() + (new Date().getTimezoneOffset() + 9 * 60) * 60 * 1000
      );
      const colors: { [index: string]: ColorResolvable } = {
        大吉: "#66ffff",
        中吉: "#00ccff",
        小吉: "#99ff99",
        吉: "#00ff00",
        末吉: "#ffff00",
        凶: "#ff3300",
        大凶: "#330000",
      };
      let firstDice: number[];
      let secondDice: number;
      let word: string;
      let timeStamp: Date;
      let firstDiceSumed: number;
      let todayfortune: number;
      let success: boolean;
      let rawFortune: number;
      let fortune: number;
      let resultFortune;
      const todayCheck =
        dbJSTTimeStamp.getDate() != nowTimeStamp.getDate() ||
        dbJSTTimeStamp.getMonth() != nowTimeStamp.getMonth() ||
        dbJSTTimeStamp.getFullYear() != nowTimeStamp.getFullYear();
      if (true) {
        firstDice = [...Array(3)].map((_) => getRandomInt(6));
        secondDice = getRandomInt(100);
        word = fortuneComments.getComment();
        timeStamp = nowTimeStamp;
        firstDiceSumed = arraySum(firstDice);
        todayfortune = firstDiceSumed * 5;
        rawFortune = user.rows[0]["fortune"];
        fortune = rawFortune * 5;
        resultFortune = Math.floor((todayfortune + fortune) / 2);
        success = secondDice <= resultFortune;

        let nextFortune: number;

        const lastDiff = rawFortune - user.rows[0]["last_fortune"];

        let coefficient: number;
        if (success) {
          if (lastDiff < 0 && user.rows[0]["last_second"] < 96) {
            coefficient = lastDiff - 1;
          } else {
            coefficient = -1;
          }
        } else {
          if (lastDiff > 0 && user.rows[0]["last_second"] > 5) {
            coefficient = lastDiff + 1;
          } else {
            coefficient = 1;
          }
        }
        if (secondDice <= 5 || 96 <= secondDice) {
          nextFortune = rawFortune + coefficient * -2;
        } else {
          nextFortune = rawFortune + coefficient;
        }
        if (nextFortune < 3) {
          nextFortune = 3;
        }
        if (nextFortune > 18) {
          nextFortune = 18;
        }

        const formtedTime = `${nowTimeStamp.getFullYear()}/${nowTimeStamp.getMonth()}/${nowTimeStamp.getDate()} ${nowTimeStamp.getHours()}:${nowTimeStamp.getMinutes()}:${nowTimeStamp.getSeconds()}+09`;
        const querty = `update users set fortune=${nextFortune}, last_time='${formtedTime}'::TIMESTAMP WITH TIME ZONE, last_fortune=${rawFortune}, last_first=ARRAY[${firstDice[0]}, ${firstDice[1]}, ${firstDice[2]}], last_second=${secondDice}, last_word='${word}' where id='${interaction.user.id}'`;
        console.log(querty);
        await pgClient.query(querty);
      }
      let ans: string;
      if (success) {
        if (secondDice <= 5) {
          ans = "大吉";
        } else if (firstDiceSumed <= 6) {
          ans = "中吉";
        } else if (firstDiceSumed <= 16) {
          ans = "吉";
        } else {
          ans = "末吉";
        }
      } else {
        if (secondDice >= 96) {
          ans = "大凶";
        } else if (firstDiceSumed <= 12) {
          ans = "小吉";
        } else {
          ans = "凶";
        }
      }
      const embed = new MessageEmbed()
        .setTimestamp(timeStamp)
        .setColor(colors[ans])
        .addFields(
          {
            name: "ユーザーの幸運",
            value: `${fortune}`,
          },
          {
            name: "今日の幸運",
            value: `${firstDiceSumed}[${firstDice.join(
              ","
            )}] → ${firstDiceSumed} → ${todayfortune}`,
          },
          {
            name: "幸運値",
            value: `(${fortune} + ${todayfortune}) / 2 = ${resultFortune}`,
          },
          {
            name: "判定",
            value: `(1d100<=${resultFortune}) → ${secondDice} → ${
              success
                ? secondDice <= 5
                  ? "決定的成功"
                  : "成功"
                : secondDice >= 96
                ? "致命的失敗"
                : "失敗"
            }`,
          },
          {
            name: "結果",
            value: ans,
          },
          {
            name: "今日のひとこと",
            value: word,
          }
        );
      if (!todayCheck) {
        embed.addField(
          "備考",
          "本日はすでに引いているため、前回の結果を表示しています。"
        );
      }
      let username = (
        await interaction.guild?.members.fetch({ user: [interaction.user.id] })
      )?.first()?.nickname;
      if (!username) {
        username = interaction.user.username;
      }
      const avatarURL = interaction.user.avatarURL();
      if (avatarURL)
        embed.setAuthor({
          name: username,
          iconURL: avatarURL,
        });
      else {
        embed.setAuthor({ name: username });
      }

      if (interaction.isButton()) {
        interaction.update({ components: [] });
        await interaction.channel?.send({
          embeds: [embed],
          components: [ButtonData.fortune],
        });
      } else {
        await interaction.reply({
          embeds: [embed],
          components: [ButtonData.fortune],
        });
      }
    }
    // senka
    else if (interaction.isCommand() && commandName === "senka") {
      const nowBox = Number(interaction.options.data[0].value); // 現在の箱
      const targetBox = Number(interaction.options.data[1].value); // 目標
      const balance = Number(interaction.options.data[2].value); // 所持戦貨

      let requiredSenka = 0; // 必要な戦貨

      for (let i = nowBox; i <= targetBox; i++) {
        requiredSenka += getRequiredSenkaByBox(i);
      }

      let ans =
        `現在**${nowBox}**箱まで開けていて、現在戦貨を**${balance}**枚持っています。\n` +
        `**${targetBox}**箱まで開けるために必要な戦貨は**${requiredSenka}**枚です。\n`;
      if (balance < requiredSenka) {
        ans += `残りの必要戦貨は**${requiredSenka - balance}**枚です。`;
      } else {
        let tmpBox = targetBox;
        let tmpBalance = balance - requiredSenka;
        while (true) {
          tmpBox++;
          tmpBalance -= getRequiredSenkaByBox(tmpBox);
          if (tmpBalance < 0) {
            tmpBalance += getRequiredSenkaByBox(tmpBox);
            tmpBox--;
            break;
          }
        }
        if (tmpBox - targetBox === 0) {
          ans += `今**${balance - requiredSenka}**枚余剰に持っています。`;
        } else {
          ans += `今**${balance - requiredSenka}**枚余剰に持っていて、あと**${
            tmpBox - targetBox
          }**箱開けられます。`;
        }
      }
      interaction.reply(ans);
    }
  } catch (e) {
    console.log(e);
  }
});

client.on("messageCreate", async (message: Message) => {
  try {
    if (!message.member?.user.bot) {
      const diceAnswer = await diceExec(message.content);
      if (diceAnswer != null) {
        const ans = diceAnswer.text.replace(/＞/g, "→");
        if (diceAnswer.secret) {
          const dm = await message.member?.user.createDM();
          dm?.send(ans);
          await message.reply("シークレットダイス");
        } else {
          await message.reply(ans);
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
});

function getRandomInt(max: number) {
  return Math.ceil(Math.random() * max);
}

function arraySum(data: Array<number>) {
  let ans = 0;
  for (const item of data) {
    ans += item;
  }
  return ans;
}

interface DiceResponse {
  ok: boolean;
  text: string;
  secret: boolean;
  success: boolean;
  failure: boolean;
  critical: boolean;
  fumble: boolean;
  rands: [
    {
      kind: string;
      sides: number;
      value: number;
    }
  ];
}

const diceExec = async (diceCommand: string) => {
  try {
    const { data }: { data: DiceResponse } = await apiClient.get(
      `/v2/game_system/Cthulhu/roll`,
      {
        params: {
          command: diceCommand,
        },
      }
    );
    if (data.ok) {
      return data;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
};

function getRequiredSenkaByBox(boxNo: Number) {
  if (boxNo <= 4) return 2200;
  if (boxNo <= 45) return 2000;
  if (boxNo <= 80) return 10000;
  return 15000;
}

try {
  client.login(token);
} catch (e) {
  console.log(e);
}

const app: express.Express = express();
const port = process.env.PORT || 3000;
app.get("/*", (_, res: express.Response) => {
  res.send(`${client.user?.tag ?? "none"}`);
});
app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
