import { Message, Client } from "discord.js";
import { from } from "linq-to-typescript";

const client = new Client({
  intents: ["GUILDS", "GUILD_MEMBERS", "GUILD_MESSAGES"],
});

client.once("ready", () => {
  console.log("Ready!");
  console.log(client.user?.tag);
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
function dice(diceData: string) {
  if (diceData.match(/d/)) diceData = diceData.replace("d", "D");
  const diceCommand = from(
    String(diceData.match(/^[1-9][0-9]*[dD][1-9][0-9]*/)).split("D")
  )
    .select((item) => Number(item))
    .toArray();
  const results = [];
  for (let i = 0; i < diceCommand[0]; i++) {
    results[i] = getRandomInt(diceCommand[1]);
  }
  let ans: string = `(${diceData}) → `;
  const total = arraySum(results);
  if (diceCommand[0] === 1) ans += String(total);
  else ans += `${total}[${results.join(",")}] → ${total}`;
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
client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;
  let messageData;

  // dice
  messageData = message.content.match(
    /^[1-9][0-9]*[dD][1-9][0-9]*(<=?[1-9][0-9]*)?/
  );
  if (messageData) {
    await message.channel.send(dice(messageData[0]));
  }
  messageData = message.content.match(/^res\(([1-9][0-9]*)-([1-9][0-9]*)\)/);
  if (messageData) {
    const me = Number(messageData[1]);
    const you = Number(messageData[2]);
    const threshold = 50 + (me - you) * 5;
    await message.channel.send(dice(`1d100<=${threshold}`));
  }
  messageData = message.content.match(/^cbr\(([1-9][0-9]*),([1-9][0-9]*)\)/);
  if (messageData) {
    const one = Number(messageData[1]);
    const two = Number(messageData[2]);
    await message.channel.send(dice(`1d100<=${one},${two}`));
  }
});
client.login(process.env.TOKEN);
