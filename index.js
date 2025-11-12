import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } from "discord.js";
import noblox from "noblox.js";
import dotenv from "dotenv";
dotenv.config();

// --- Load environment variables ---
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const cookie = process.env.ROBLOX_COOKIE;
const groupId = parseInt(process.env.ROBLOX_GROUP_ID);

// --- Discord bot setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Roblox login ---
async function startBot() {
  try {
    const currentUser = await noblox.setCookie(cookie);
    if (!currentUser || !currentUser.username) {
      console.error("[❌] Roblox login failed or returned undefined username.");
    } else {
      console.log(`[✅] Logged into Roblox as ${currentUser.username}`);
    }

    await client.login(token);
    console.log("[🤖] Logged into Discord!");
  } catch (err) {
    console.error("Error logging in:", err);
  }
}

// --- Emoji configuration ---
const EMOJIS = {
  PROMOTE: ["<a:promote1:1438045523373326336>", "<a:promote2:1438046026450866308>"],
  DEMOTE: ["<:demote1:1438048236177723452>", "<a:pengusadhug:1438046903513256051>"],
  KICK: ["<a:kick1:1438048859061354559>"],
  FAILURE: "❌",
};

// --- In-memory log storage ---
const actionLog = []; // {username, action, rankName?, rankNumber?, timestamp}

// --- Register slash commands ---
const commands = [
  {
    name: "promote",
    description: "Promote a user in the Roblox group",
    options: [{ name: "username", type: 3, description: "Roblox username", required: true }],
  },
  {
    name: "demote",
    description: "Demote a user in the Roblox group",
    options: [{ name: "username", type: 3, description: "Roblox username", required: true }],
  },
  {
    name: "kick",
    description: "Kick a user from the Roblox group",
    options: [{ name: "username", type: 3, description: "Roblox username", required: true }],
  },
  {
    name: "setrank",
    description: "Set a user's rank by name or number",
    options: [
      { name: "username", type: 3, description: "Roblox username", required: true },
      { name: "rankname", type: 3, description: "Rank name (optional)", required: false },
      { name: "ranknumber", type: 4, description: "Rank number (optional)", required: false },
    ],
  },
  {
    name: "rankinfo",
    description: "Show all group ranks and their numbers",
  },
  {
    name: "rankhistory",
    description: "Shows the last 6 rank changes for a user",
    options: [{ name: "username", type: 3, description: "Roblox username", required: true }],
  },
  {
    name: "auditlog",
    description: "Shows the last 6 actions performed in the group",
  },
];

const rest = new REST({ version: "10" }).setToken(token);
(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Slash commands registered!");
  } catch (err) {
    console.error("Error registering slash commands:", err);
  }
})();

// --- Handle slash command interactions ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const { commandName, options } = interaction;
  const username = options.getString("username");

  try {
    // === /RANKINFO ===
    if (commandName === "rankinfo") {
      await interaction.deferReply();
      const ranks = await noblox.getRoles(groupId);
      const sortedRanks = ranks.sort((a, b) => a.rank - b.rank);
      const formatted = sortedRanks.map(r => `**${r.rank}** - ${r.name}`).join("\n");

      const embed = new EmbedBuilder()
        .setTitle("📋 Group Rank List")
        .setDescription(formatted)
        .setColor(0x00aaff)
        .setTimestamp();

      return await interaction.editReply({ embeds: [embed] });
    }

    // === /PROMOTE ===
    if (commandName === "promote") {
      if (!username) return interaction.reply({ content: `${EMOJIS.FAILURE} Please provide a username.`, ephemeral: true });

      const userId = await noblox.getIdFromUsername(username);
      const result = await noblox.promote(groupId, userId);

      // log action
      actionLog.unshift({ username, action: "Promoted", rankName: result.newRole.name, rankNumber: result.newRole.rank, timestamp: new Date() });
      if (actionLog.length > 100) actionLog.pop();

      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.PROMOTE[1]} Promoted! ${EMOJIS.PROMOTE[0]}`)
        .setDescription(`**${username}** has been promoted to **${result.newRole.name}**.`)
        .setColor(0x00ff00)
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }

    // === /DEMOTE ===
    if (commandName === "demote") {
      if (!username) return interaction.reply({ content: `${EMOJIS.FAILURE} Please provide a username.`, ephemeral: true });

      const userId = await noblox.getIdFromUsername(username);
      const result = await noblox.demote(groupId, userId);

      // log action
      actionLog.unshift({ username, action: "Demoted", rankName: result.newRole.name, rankNumber: result.newRole.rank, timestamp: new Date() });
      if (actionLog.length > 100) actionLog.pop();

      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.DEMOTE[0]} Demoted! ${EMOJIS.DEMOTE[1]}`)
        .setDescription(`**${username}** has been demoted to **${result.newRole.name}**.`)
        .setColor(0xff0000)
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }

    // === /KICK ===
    if (commandName === "kick") {
      if (!username) return interaction.reply({ content: `${EMOJIS.FAILURE} Please provide a username.`, ephemeral: true });

      const userId = await noblox.getIdFromUsername(username);
      const groupInfo = await noblox.getGroup(groupId);
      await noblox.exile(groupId, userId);

      // log action
      actionLog.unshift({ username, action: "Kicked", timestamp: new Date() });
      if (actionLog.length > 100) actionLog.pop();

      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.KICK[0]} Kicked! ${EMOJIS.KICK[0]}`)
        .setDescription(`Kicked **${username}** from the **${groupInfo.name}** group.`)
        .setColor(0xff0000)
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }

    // === /SETRANK ===
    if (commandName === "setrank") {
      const rankName = options.getString("rankname");
      const rankNumber = options.getInteger("ranknumber");
      if (!username) return interaction.reply({ content: `${EMOJIS.FAILURE} Please provide a username.`, ephemeral: true });

      const userId = await noblox.getIdFromUsername(username);
      const ranks = await noblox.getRoles(groupId);
      let rankToSet;
      if (rankNumber) rankToSet = ranks.find(r => r.rank === rankNumber);
      else if (rankName) rankToSet = ranks.find(r => r.name.toLowerCase().includes(rankName.toLowerCase()));

      if (!rankToSet) return interaction.reply({ content: `${EMOJIS.FAILURE} Could not find a matching rank.`, ephemeral: true });

      await noblox.setRank(groupId, userId, rankToSet.rank);

      // log action
      actionLog.unshift({ username, action: "SetRank", rankName: rankToSet.name, rankNumber: rankToSet.rank, timestamp: new Date() });
      if (actionLog.length > 100) actionLog.pop();

      const embed = new EmbedBuilder()
        .setTitle(`✅ Rank Updated!`)
        .setDescription(`**${username}** has been set to **${rankToSet.name}** (Rank: ${rankToSet.rank}).`)
        .setColor(0x00ff88)
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }

    // === /RANKHISTORY ===
    if (commandName === "rankhistory") {
      if (!username) return interaction.reply({ content: `${EMOJIS.FAILURE} Please provide a username.`, ephemeral: true });

      const history = actionLog.filter(a => a.username.toLowerCase() === username.toLowerCase()).slice(0, 6);
      if (!history.length) return interaction.reply({ content: `No recent actions found for **${username}**.`, ephemeral: true });

      const desc = history.map(a => {
        if (a.rankName) return `**${a.action}** - ${a.rankName} (Rank: ${a.rankNumber})`;
        return `**${a.action}**`;
      }).join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`📜 Rank History: ${username}`)
        .setDescription(desc)
        .setColor(0x00aaff)
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }

    // === /AUDITLOG ===
    if (commandName === "auditlog") {
      const history = actionLog.slice(0, 6);
      if (!history.length) return interaction.reply({ content: `No recent actions found.`, ephemeral: true });

      const desc = history.map(a => {
        const userPart = a.username ? `**${a.username}**` : '';
        if (a.rankName) return `${userPart} - **${a.action}** - ${a.rankName} (Rank: ${a.rankNumber})`;
        return `${userPart} - **${a.action}**`;
      }).join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`📜 Recent Group Actions`)
        .setDescription(desc)
        .setColor(0x00aaff)
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    const errorEmbed = new EmbedBuilder()
      .setDescription(`${EMOJIS.FAILURE} Could not ${commandName} **${username || ""}**.`)
      .setColor(0xff0000)
      .setTimestamp();
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
});

// --- Start the bot ---
startBot();
