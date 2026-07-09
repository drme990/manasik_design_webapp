'use server';

import { destroySession } from './session';

export async function logout(): Promise<void> {
  await destroySession();
}
