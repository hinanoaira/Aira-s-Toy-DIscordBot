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

const client = new Client({
  intents: ["GUILDS", "GUILD_MEMBERS", "GUILD_MESSAGES"],
});
const emptyData: ApplicationCommandDataResolvable[] = [];
const commandData: ApplicationCommandDataResolvable[] = [
  {
    name: "ping",
    description: "pong!",
  },
  {
    name: "dice",
    description: "ダイスロールを行います",
    options: [
      {
        type: "STRING",
        name: "dice",
        description: "ダイスコマンド",
        required: true,
      },
    ],
  },
  {
    name: "secretdice",
    description: "他の人に見えない形でダイスロールを行います",
    options: [
      {
        type: "STRING",
        name: "dice",
        description: "ダイスコマンド",
        required: true,
      },
    ],
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
  // dice
  else if (interaction.isCommand() && commandName === "dice") {
    const arg = interaction.options.data[0].value;
    if (typeof arg !== "string") return;
    const diceData = diceBuild(arg);
    if (!diceData) {
      await interaction.reply("こまんどがへんです。。。");
      return;
    }
    const ans = diceExec(diceData);
    await interaction.reply({ content: ans });
  }
  // secretdice
  else if (interaction.isCommand() && commandName === "secretdice") {
    const arg = interaction.options.data[0].value;
    if (typeof arg !== "string") return;
    const diceData = diceBuild(arg);
    if (!diceData) {
      await interaction.reply("こまんどがへんです。。。");
      return;
    }
    const ans = diceExec(diceData);
    await interaction.channel?.send(
      `${interaction.user.username} > シークレットダイス`
    );
    await interaction.reply({ content: ans, ephemeral: true });
  }
  // fortune
  else if (commandName === "fortune") {
    let user = await pgClient.query(
      `select * from users where id='${interaction.user.id}'`
    );
    if (user.rows.length < 1) {
      await pgClient.query(
        `insert into users values ('${interaction.user.id}', 11, '2000-01-01 00:00:00+09'::TIMESTAMP WITH TIME ZONE, 0, ARRAY[0, 0, 0], 0, 'dummy')`
      );
      user = await pgClient.query(
        `select * from users where id='${interaction.user.id}'`
      );
    }
    const dbTimeStamp: Date = user.rows[0]["last_time"];
    const dbJSTTimeStamp = new Date(
      dbTimeStamp.getTime() +
        (dbTimeStamp.getTimezoneOffset() + 9 * 60) * 60 * 1000
    );
    const nowTimeStamp = new Date();
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
    const todayCheck =
      dbJSTTimeStamp.getDate() != nowTimeStamp.getDate() ||
      dbJSTTimeStamp.getMonth() != nowTimeStamp.getMonth() ||
      dbJSTTimeStamp.getFullYear() != nowTimeStamp.getFullYear();
    if (todayCheck) {
      firstDice = [...Array(3)].map((_) => getRandomInt(6));
      secondDice = getRandomInt(100);
      word = fortuneComments.getComment();
      timeStamp = nowTimeStamp;
      firstDiceSumed = arraySum(firstDice);
      todayfortune = firstDiceSumed * 5;
      success = secondDice <= todayfortune;
      rawFortune = user.rows[0]["fortune"];
      fortune = rawFortune * 5;

      let nextFortune: number;
      if (success) {
        if (secondDice <= 5) {
          nextFortune = rawFortune + 2 > 18 ? 18 : rawFortune + 2;
        } else {
          nextFortune = rawFortune + 1 > 18 ? 18 : rawFortune + 1;
        }
      } else {
        if (secondDice >= 96) {
          nextFortune = rawFortune - 2 < 3 ? 3 : rawFortune - 2;
        } else {
          nextFortune = rawFortune - 1 < 3 ? 3 : rawFortune - 1;
        }
      }

      const querty = `update users set fortune=${nextFortune}, last_time='${timeStamp.toISOString()}'::TIMESTAMP WITH TIME ZONE, last_fortune=${rawFortune}, last_first=ARRAY[${
        firstDice[0]
      }, ${firstDice[1]}, ${
        firstDice[2]
      }], last_second=${secondDice}, last_word='${word}' where id='${
        interaction.user.id
      }'`;
      await pgClient.query(querty);
    } else {
      firstDice = user.rows[0]["last_first"];
      secondDice = user.rows[0]["last_second"];
      word = user.rows[0]["last_word"];
      timeStamp = dbTimeStamp;
      firstDiceSumed = arraySum(firstDice);
      todayfortune = firstDiceSumed * 5;
      success = secondDice <= todayfortune;
      rawFortune = user.rows[0]["last_fortune"];
      fortune = rawFortune * 5;
    }
    const resultFortune = Math.floor((todayfortune + fortune) / 2);
    let ans: string;
    if (success) {
      if (secondDice <= 5) {
        ans = "大吉";
      } else if (firstDiceSumed <= 5) {
        ans = "中吉";
      } else if (firstDiceSumed <= 10) {
        ans = "小吉";
      } else {
        ans = "吉";
      }
    } else {
      if (secondDice >= 96) {
        ans = "大凶";
      } else if (firstDiceSumed <= 10) {
        ans = "末吉";
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
});

client.on("messageCreate", async (message: Message) => {
  const diceData = diceBuild(message.content);
  if (diceData) {
    await message.reply(diceExec(diceData));
  } else if (message.content === "!airaCommandDelete") {
    if (message.guildId !== null) {
      await client.application?.commands.set(emptyData, message.guildId);
      await message.reply("コマンドを削除しました");
      return;
    }
    await message.reply("更新できませんでした");
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

function thresholdCheck(num: Number, threshold: Number, lessThan: Boolean) {
  if (lessThan) {
    return num < threshold;
  } else {
    return num <= threshold;
  }
}

function diceBuild(message: String) {
  let messageData: RegExpMatchArray | null;

  // dice
  messageData = message.match(
    /^(100|[1-9][0-9]?)[dD](100|[1-9][0-9]?)(<=?(100|[1-9][0-9]?))?/
  );
  if (messageData) {
    return messageData[0];
  }

  // res
  messageData = message.match(/^res\((100|[1-9][0-9]?)-(100|[1-9][0-9]?)\)/);
  if (messageData) {
    const me = Number(messageData[1]);
    const you = Number(messageData[2]);
    const threshold = 50 + (me - you) * 5;
    return `1d100<=${threshold}`;
  }

  // cbr
  messageData = message.match(/^cbr\((100|[1-9][0-9]?),(100|[1-9][0-9]?)\)/);
  if (messageData) {
    const one = Number(messageData[1]);
    const two = Number(messageData[2]);
    return `1d100<=${one},${two}`;
  }
  return null;
}

function diceExec(diceData: string) {
  if (diceData.match(/D/)) diceData = diceData.replace("D", "d");

  // ダイス実行
  const diceCommand = String(diceData.match(/^[1-9][0-9]*[d][1-9][0-9]*/))
    .split("d")
    .map((item) => Number(item));
  const results = [...Array(diceCommand[0])].map((_) =>
    getRandomInt(diceCommand[1])
  );
  const total = arraySum(results);

  let ans = `(${diceData}) → `;
  if (diceCommand[0] === 1) ans += String(total);
  else ans += `${total}[${results.join(",")}] → ${total}`;

  // 成否判定
  const thresholdData = diceData.match(/<=?([1-9][0-9]*)(,([1-9][0-9]*))?$/);
  const lessThan = !diceData.includes("<=");

  if (thresholdData) {
    const dicen = diceCommand.join("d");
    if (thresholdData[3] !== undefined) {
      const data1 = thresholdCheck(total, Number(thresholdData[1]), lessThan);
      const data2 = thresholdCheck(total, Number(thresholdData[3]), lessThan);
      ans += `[${data1 ? "成功" : "失敗"},${data2 ? "成功" : "失敗"}] → `;
      if (data1 && data2)
        ans += dicen === "1d100" && total <= 5 ? "決定的成功" : "成功";
      else if (data1 !== data2) ans += "部分的成功";
      else ans += dicen === "1d100" && total >= 95 ? "致命的失敗" : "失敗";
    } else {
      const data1 = thresholdCheck(total, Number(thresholdData[1]), lessThan);
      ans += ` → ${
        data1
          ? dicen === "1d100" && total <= 5
            ? "決定的成功"
            : "成功"
          : dicen === "1d100" && total >= 96
          ? "致命的失敗"
          : "失敗"
      }`;
    }
  }

  return ans;
}

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
  res.send("Hello,World!");
});
app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
