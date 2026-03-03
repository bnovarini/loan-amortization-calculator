import express from 'express';
import { loanRoutes } from './routes';

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use('/api', loanRoutes);
  return app;
}

if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => {
    console.log(`Loan amortization API listening on port ${PORT}`);
  });
}
