import { Message, Client, ApplicationCommandDataResolvable } from "discord.js";
import { fortuneComments } from "./fortuneComments";
import express from "express";
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
    description: "1d100を2度振って今日の運勢を占います",
  },
  {
    name: "cfortune",
    description: "幸運値(3d6*5)で今日の運勢を占います",
  },
  {
    name: "commandrefresh",
    description: "コマンド一覧を更新します",
  },
];

client.once("ready", async () => {
  console.log(client.user?.tag);
  try {
    await client.application?.commands.set(emptyData);
  } catch (e) {
    console.log(e);
  }
  console.log("Ready!");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }

  // ping
  if (interaction.commandName === "ping") {
    await interaction.reply("pong!");
  } else if (interaction.commandName === "commandrefresh") {
    if (interaction.guildId !== null) {
      await client.application?.commands.set(commandData, interaction.guildId);
      await interaction.reply("更新しました");
      return;
    }
    await interaction.reply("更新できませんでした。");
  } else if (interaction.commandName === "dice") {
    const arg = interaction.options.data[0].value;
    if (typeof arg !== "string") return;
    const diceData = diceBuild(arg);
    if (!diceData) {
      await interaction.reply("こまんどがへんです。。。");
      return;
    }
    const ans = diceExec(diceData);
    await interaction.reply({ content: ans });
  } else if (interaction.commandName === "secretdice") {
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
  } else if (interaction.commandName === "fortune") {
    const firstDice = getRandomInt(100);
    const secondDice = getRandomInt(100);
    let ans =
      `ダイス1投目 → (1d100) → ${firstDice}\n` +
      `ダイス2投目 → (1d100<=${firstDice}) → ${secondDice} →`;
    if (secondDice <= firstDice) {
      if (secondDice <= 5) {
        ans += "大吉";
      } else if (firstDice <= 25) {
        ans += "中吉";
      } else if (firstDice <= 50) {
        ans += "小吉";
      } else {
        ans += "吉";
      }
    } else {
      if (secondDice >= 96) {
        ans += "大凶";
      } else if (firstDice <= 50) {
        ans += "末吉";
      } else {
        ans += "凶";
      }
    }
    ans += `\n\n${fortuneComments.getComment()}`;
    await interaction.reply(ans);
  } else if (interaction.commandName === "cfortune") {
    const firstDice = [...Array(3)].map((_) => getRandomInt(6));
    const firstDiceSumed = arraySum(firstDice);
    const fortune = firstDiceSumed * 5;
    const secondDice = getRandomInt(100);
    const success = secondDice <= fortune;
    const ans =
      `ダイス1投目 → (3d6) → ${firstDiceSumed}[${firstDice.join(
        ","
      )}] → ${firstDiceSumed}(幸運:${fortune})\n` +
      `ダイス2投目 → (1d100<=${fortune}) → ${secondDice} → ${
        success
          ? secondDice <= 5
            ? "決定的成功"
            : "成功"
          : secondDice >= 96
          ? "致命的失敗"
          : "失敗"
      }\n\n` +
      (success
        ? "貴方の今日という一日に幸あれ"
        : "この結果に負けず幸せを自分で掴み取っていきましょう");
    await interaction.reply(ans);
  }
});

client.on("messageCreate", async (message: Message) => {
  const diceData = diceBuild(message.content);
  if (diceData) {
    await message.reply(diceExec(diceData));
  } else if (message.content === "!airaCommandRegist") {
    if (message.guildId !== null) {
      await client.application?.commands.set(commandData, message.guildId);
      await message.reply("コマンドを更新しました");
      return;
    }
    await message.reply("更新できませんでした");
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
