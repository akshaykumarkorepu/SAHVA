import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  maxRetries: 3,
});

export const MODEL = env.ANTHROPIC_MODEL;
