import { getMongoClient, closeMongoClient } from '@/lib/db/mongodb';
import { hashPassword } from '@/lib/auth/password';

async function seed() {
  const email = process.argv[2] || 'admin@manasik.design';
  const password = process.argv[3] || 'admin123';
  const name = process.argv[4] || 'Admin';

  const client = getMongoClient();

  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }

  const collection = client.getCollection('users_admin_panel');
  if (!collection) {
    console.error('Failed to connect to MongoDB');
    process.exit(1);
  }

  const hashedPassword = await hashPassword(password);

  await collection.updateOne(
    { email: email.toLowerCase() },
    {
      $set: {
        email: email.toLowerCase(),
        name,
        password: hashedPassword,
        role: 'super_admin',
        allowedPages: [],
        ref: '',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  console.log(`User seeded: ${email} / ${password}`);
  await closeMongoClient();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
