import { VersionedTransaction } from "@solana/web3.js";
import { SolanaAgentKit } from "solana-agent-kit";

export async function rps(
  agent: SolanaAgentKit,
  amount: number,
  choice: "R" | "P" | "S",
): Promise<string> {
  try {
    // const res = await fetch(
    //   `https://rps.sendarcade.fun/api/actions/backend?amount=${amount}&choice=${choice}&player=B`,
    //   {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application"
    //     },
    //     body: JSON.stringify({
    //       account: agent.wallet.publicKey.toBase58(),
    //     }),
    //   },
    // );

    // const data = await res.json();

    // const txn = VersionedTransaction.deserialize(
    //   Buffer.from(data.transaction, "base64"),
    // );
    // const { blockhash } = await agent.connection.getLatestBlockhash();
    // txn.message.recentBlockhash = blockhash;

    // // Sign and send transaction
    // txn.sign([agent.wallet]);
    // const signature = await agent.connection.sendTransaction(txn, {
    //   preflightCommitment: "confirmed",
    //   maxRetries: 3,
    // });

    // const latestBlockhash = await agent.connection.getLatestBlockhash();
    // await agent.connection.confirmTransaction({
    //   signature,
    //   blockhash: latestBlockhash.blockhash,
    //   lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    // });
    return "done";
  } catch (error: any) {
    console.error(error);
    throw new Error(`RPS game failed: ${error.message}`);
  }
}