import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(
  candidatePassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, hashedPassword);
}
