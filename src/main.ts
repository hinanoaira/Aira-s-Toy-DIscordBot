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
const debug = process.env.DEBUG;
const escapeRegex = /(\*|\_|\~|\||\`)/g;
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
      const nowTimeStamp = new Date();
      const colors: { [index: string]: ColorResolvable } = {
        大吉: "#66ffff",
        中吉: "#00ccff",
        小吉: "#99ff99",
        吉: "#00ff00",
        末吉: "#88ff00",
        凶: "#ff3300",
        大凶: "#330000",
      };
      let firstDice: DiceResponse;
      let secondDice: DiceResponse;
      let word: string;
      let timeStamp: Date;
      let firstDiceSumed: number;
      let todayfortune: number;
      let rawFortune: number;
      let fortune: number;
      let resultFortune: number;
      const todayCheck =
        dbTimeStamp.getDate() != nowTimeStamp.getDate() ||
        dbTimeStamp.getMonth() != nowTimeStamp.getMonth() ||
        dbTimeStamp.getFullYear() != nowTimeStamp.getFullYear();
      if (todayCheck || debug == "true") {
        timeStamp = nowTimeStamp;
        rawFortune = user.rows[0]["fortune"];
        fortune = rawFortune * 5;

        firstDice = (await diceExec("3d6*5"))!;
        firstDiceSumed = arraySum(firstDice.rands.map((i) => i.value));
        todayfortune = firstDiceSumed * 5;
        resultFortune = Math.floor((todayfortune + fortune) / 2);

        secondDice = (await diceExec(`CCB<=${resultFortune}`))!;

        const wordDice = (await diceExec(
          `1d${fortuneComments.comments.length}`
        ))!;
        word = fortuneComments.comments[wordDice.rands[0].value - 1];

        let nextFortune: number;

        const lastDiff = rawFortune - user.rows[0]["last_fortune"];

        let coefficient: number;
        if (secondDice.success) {
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
        if (secondDice.critical || secondDice.fumble) {
          nextFortune = rawFortune + coefficient * -3;
        } else {
          nextFortune = rawFortune + coefficient;
        }
        if (nextFortune < 3) {
          nextFortune = 3;
        }
        if (nextFortune > 18) {
          nextFortune = 18;
        }

        const formtedTime = `${nowTimeStamp.getFullYear()}/${
          nowTimeStamp.getMonth() + 1
        }/${nowTimeStamp.getDate()} ${nowTimeStamp.getHours()}:${nowTimeStamp.getMinutes()}:${nowTimeStamp.getSeconds()}+09`;
        const querty = `update users set fortune=${nextFortune}, last_time='${formtedTime}'::TIMESTAMP WITH TIME ZONE, last_fortune=${rawFortune}, last_first=ARRAY[${firstDice.rands[0].value}, ${firstDice.rands[1].value}, ${firstDice.rands[2].value}], last_second=${secondDice.rands[0].value}, last_word='${word}' where id='${interaction.user.id}'`;
        console.log(querty);
        await pgClient.query(querty);
      } else {
        const firstRands: number[] = user.rows[0]["last_first"];
        word = user.rows[0]["last_word"];
        timeStamp = dbTimeStamp;
        firstDiceSumed = arraySum(firstRands);
        todayfortune = firstDiceSumed * 5;
        rawFortune = user.rows[0]["last_fortune"];
        fortune = rawFortune * 5;
        resultFortune = Math.floor((todayfortune + fortune) / 2);
        firstDice = {
          ok: true,
          text: `(3D6*5) ＞ ${firstDiceSumed}[${firstRands.join(",")}]*5 ＞ ${
            firstDiceSumed * 5
          }`,
          secret: false,
          success: false,
          failure: false,
          critical: false,
          fumble: false,
          rands: firstRands.map((e) => {
            return { kind: "normal", sides: 6, value: e };
          }),
        };
        const secondRands: number[] = [user.rows[0]["last_second"]];
        const success = secondRands[0] <= resultFortune;
        const critical = secondRands[0] <= 5;
        const fumble = secondRands[0] >= 96;
        const spetial = secondRands[0] <= resultFortune / 5;
        secondDice = {
          ok: true,
          text: `(1D100<=${resultFortune}) ＞ ${secondRands[0]} ＞ ${
            success
              ? critical
                ? spetial
                  ? "決定的成功/スペシャル"
                  : "決定的成功"
                : spetial
                ? "スペシャル"
                : "成功"
              : fumble
              ? "致命的失敗"
              : "失敗"
          }`,
          secret: false,
          success: success,
          failure: false,
          critical: critical,
          fumble: fumble,
          rands: secondRands.map((e) => {
            return { kind: "normal", sides: 6, value: e };
          }),
        };
      }
      let ans: string;
      if (secondDice.success) {
        if (secondDice.critical) {
          ans = "大吉";
        } else if (firstDiceSumed <= 6) {
          ans = "末吉";
        } else if (firstDiceSumed <= 14) {
          ans = "吉";
        } else {
          ans = "中吉";
        }
      } else {
        if (secondDice.fumble) {
          ans = "大凶";
        } else if (firstDiceSumed <= 10) {
          ans = "凶";
        } else {
          ans = "小吉";
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
            value: textEscape(firstDice.text),
          },
          {
            name: "幸運値",
            value: `(${fortune} + ${todayfortune}) / 2 = ${resultFortune}`,
          },
          {
            name: "判定",
            value: secondDice.text,
          },
          {
            name: "結果",
            value: ans,
          },
          {
            name: "今日のひとこと",
            value: word.replace(/\{username\}/g, interaction.user.username),
          }
        );
      if (!todayCheck && debug != "true") {
        embed
          .addField(
            "備考",
            "本日はすでに引いているため、前回の結果を表示しています。"
          )
          .setImage("https://i.imgur.com/M7tqH51.png");
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
    if (!interaction.isCommand() || !interaction.isButton()) {
      return;
    }
    interaction.reply("エラーが発生しました");
  }
});

client.on("messageCreate", async (message: Message) => {
  const regex =
    /^S?([+\-(]*(\d+|D\d+)|\d+B\d+|\d+T[YZ]\d+|C[+\-(]*\d+|choice|D66|(repeat|rep|x)\d+|\d+R\d+|\d+U\d+|BCDiceVersion|CCB?|RESB?|CBRB?)/i;
  try {
    if (!message.member?.user.bot && regex.test(message.content)) {
      const diceAnswer = await diceExec(message.content);
      if (diceAnswer != null) {
        if (diceAnswer.secret) {
          const dm = await message.member?.user.createDM();
          dm?.send(textEscape(diceAnswer.text));
          await message.reply("シークレットダイス");
        } else {
          await message.reply(textEscape(diceAnswer.text));
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
});

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
  rands: DiceResponseRands[];
}
interface DiceResponseRands {
  kind: string;
  sides: number;
  value: number;
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

const textEscape = (text: string) => {
  return text.replace(escapeRegex, "\\$1");
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
app.get("/", (_, res: express.Response) => {
  res.send(`${client.user?.tag ?? "none"}`);
});
app.get("/gone", (_, res: express.Response) => {
  res.status(410).send('Gone.');
});
app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
