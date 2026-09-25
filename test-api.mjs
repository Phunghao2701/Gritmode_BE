import { getUserById } from './src/controllers/admin-user.controller.js';

const req = {
  params: { userId: '6ae7bbcf-2574-438d-8b6d-380a1ba44b5f' },
  user: { user_id: 'e60034f2-9f58-4500-ad1d-f8e1735e1f01', role: 'admin' },
};

const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    console.log('JSON RESPONSE:', data);
    return this;
  },
};

const next = (err) => {
  console.error('NEXT CALLED WITH ERROR:', err);
};

async function run() {
  await getUserById(req, res, next);
  process.exit(0);
}

run();
