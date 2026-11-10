import { z } from "zod";

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }).max(254));

export const loginSchema = z.object({
  email,
  password: z
    .string({ error: "Enter your password." })
    .min(1, { error: "Enter your password." })
    .max(72),
});

export const signupSchema = z.object({
  full_name: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, { error: "Enter your name." })
    .max(100, { error: "Name must be 100 characters or fewer." }),
  email,
  password: z
    .string({ error: "Choose a password." })
    .min(8, { error: "Password must be at least 8 characters." })
    // Supabase (bcrypt) only uses the first 72 bytes of a password.
    .max(72, { error: "Password must be 72 characters or fewer." }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
