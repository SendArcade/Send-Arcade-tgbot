export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { Bot, webhookCallback } from 'grammy';
import { SolanaAgentKit, createSolanaTools } from 'solana-agent-kit';
import { rps, claimback } from '../../tools/rps';
import OpenAI from 'openai';
import { clusterApiUrl, Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getApps, initializeApp, getApp } from "firebase/app";
import { getDoc, doc, getFirestore, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import bs58 from 'bs58';

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = !getApps.length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Initialize Solana agent
// const agent = new SolanaAgentKit(
//   process.env.WALLET || 'your-wallet',
//   'https://api.devnet.solana.com',
//   process.env.OPENAI_API_KEY || 'key'
// );

// const tools = createSolanaTools(agent);

// Rock-Paper-Scissors function
async function rockPaperScissors(agent: SolanaAgentKit, amount: number, choice: "rock" | "paper" | "scissors") {
  return rps(agent, amount, choice);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable not found.');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'key' });

// Telegram bot setup
const bot = new Bot(token);

// User state tracking ongoing conversations
const userStates: Record<string, { chatHistory: string[]; inProgress: boolean }> = {};

// Generate a new Solana key pair for a user and store it in Firebase
async function getOrCreateUserKeyPair(userId: string) {
  const userDocRef = doc(db, 'users', userId);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    // Return existing key pair
    return userDocSnap.data();
  }

  // Generate a new key pair
  const keypair = Keypair.generate();
  const keypairData = {
    publicKey: keypair.publicKey.toString(),
    privateKey: String(bs58.encode(keypair.secretKey)),
    inProgress: false,
  };

  // Store in Firebase
  await setDoc(userDocRef, keypairData);

  return keypairData;
}

// Analyze chat history with OpenAI
async function analyzeChatWithOpenAI(chatHistory: string[]): Promise<{ response: string; amount?: number; choice?: "rock" | "paper" | "scissors" }> {
  const prompt = `
You are "Send Arcade AI Agent", a quirky and fun assistant for SendArcade.fun! Your mission:
- Engage users with playful, witty conversations about gaming.
- You only have excess to Rock-Paper-Scissors game BLINK and nothing else.
- If they express interest in playing Rock-Paper-Scissors (or any game), subtly nudge them to start by asking for the betting amount and choice.
- Extract the "amount" (a floating-point number in SOL) they want to bet and their "choice" ("rock", "paper", or "scissors").
- Make your replies fun, exciting, and game-like to keep the user engaged.
- If you have already returned amount and choice, do not return it again and again unless user asks to play again.

Return a JSON object with:
- "response": string (your reply to the user)
- "amount": number (optional, extracted bet amount)
- "choice": string (optional, extracted choice: "rock", "paper", or "scissors").

Chat history:
${chatHistory.join('\n')}
  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'system', content: prompt }],
    max_tokens: 300,
    temperature: 0.8,
  });

  try {
    if (!response.choices[0].message.content) {
      return { response: "Oops, my joystick slipped! Can you repeat that?" };
    }
    return JSON.parse(response.choices[0].message.content.trim());
  } catch {
    return { response: "Woah, I got stuck in a game loop. Can you say that again?" };
  }
}

// Telegram bot handler
bot.on('message:text', async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return;
  // Get or create user key pair
  const keyPair = await getOrCreateUserKeyPair(userId);
  const agent = new SolanaAgentKit(
    keyPair.privateKey || 'your-wallet',
    'https://api.devnet.solana.com',
    process.env.OPENAI_API_KEY || 'key'
  );
  const connection = new Connection(clusterApiUrl("devnet"));
  if (ctx.message.text.startsWith('/claim')) {
    const parts = ctx.message.text.split(' ');
    if (parts.length === 2) {
      const pubkey = parts[1];
      if (pubkey) {
        const userBalance = (await connection.getBalance(agent.wallet.publicKey)) / LAMPORTS_PER_SOL;
        if (userBalance < 0.000001) {
          await ctx.reply(`You do not have enough amount in your wallet to claimback. Your balance: ${userBalance} SOL.`);
          return;
        }
        await ctx.reply('Claiming your prize. Please wait... 🎁');
        let res = await claimback(agent, pubkey);
        await new Promise(resolve => setTimeout(resolve, 5000));
        await ctx.reply(`${res}`);
        return;
      }
      else 
      {
        await ctx.reply('Invalid claim command. Use /claim <PubKey>.');
        return;
      }
    }
    await ctx.reply('Invalid claim command. Use /claim <PubKey>.');
    return;
  }
  // Inform the user about their public key
  if(keyPair.inProgress){
    await ctx.reply(`Hold on! I'm still processing your last move. 🎮`);
    return;
  }
  // await ctx.reply(`Your unique Solana wallet for this game: ${String(keyPair.publicKey)}`);

  // Initialize user state if not already present
  if (!userStates[userId]) {
    userStates[userId] = { chatHistory: [], inProgress: false };
  }

  const userState = userStates[userId];
  // userState.chatHistory = [];
  // Prevent overlapping requests
  if (userState.inProgress) {
    await ctx.reply("Hold on! I'm still processing your last move. 🎮");
    return;
  }

  // Get the user message and add it to the chat history
  const userMessage = ctx.message.text;
  userState.chatHistory.push(`User: ${userMessage}`);

  try {
    // Analyze the chat history
    const analysis = await analyzeChatWithOpenAI(userState.chatHistory);

    // Add OpenAI's response to the chat history
    userState.chatHistory.push(`Send Arcade AI Agent: ${analysis.response}`);

    // Send the response to the user
    await ctx.reply(analysis.response);

    // Check if both the amount and choice were extracted
    if (analysis.amount !== undefined && analysis.choice) {
      userState.inProgress = true;


      try {
        // Call the game function and await its result
        let amount = analysis.amount;
        let choice = analysis.choice;
        analysis.amount = undefined;
        analysis.choice = undefined;
        userState.chatHistory = [];
        const connection = new Connection(clusterApiUrl("devnet"));
        const userBalance = (await connection.getBalance(agent.wallet.publicKey)) / LAMPORTS_PER_SOL;
        if (userBalance < amount) {
          await ctx.reply(`OOPS! Looks like you don't have enough SOL in your wallet to play this game. Your balance: ${userBalance} SOL.\n Please top up your wallet by sending the sol to this address ${String(keyPair.publicKey)}.`);
          return;
        }
        // Confirm function call
        await ctx.reply(`Let's play! Bet: ${amount} SOL, Choice: ${choice}. 🎲`);
        await ctx.reply(`Please wait while I process your move in our BLINK... 🕒`);
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, { inProgress: true });
        const result = await rockPaperScissors(agent, amount, choice);

        // Inform the user of the result

        await ctx.reply(`${result[0]}\n${result[1]}\n${result[2]}`);
      } catch (error) {
        console.error("Error in rockPaperScissors:", error);
        await ctx.reply(String(error));
        //"Oops! Something went wrong during the game. Try again? 🚀"
      } finally {
        // Reset state
        userState.inProgress = false;
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, { inProgress: false });
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
    await ctx.reply(String(error));
    //"Yikes! Something went wrong. Try again? 🚀""Yikes! Something went wrong. Try again? 🚀"
    userState.inProgress = false; // Reset in case of error
  }
});

// Export webhook handler
export const POST = webhookCallback(bot, 'std/http');
