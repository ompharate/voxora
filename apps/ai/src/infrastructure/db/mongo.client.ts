import mongoose from "mongoose";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected || mongoose.connection.readyState === 1) {
    connected = true;
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }
  await mongoose.connect(uri);
  connected = true;
  console.log("[DB] MongoDB connected");
}
