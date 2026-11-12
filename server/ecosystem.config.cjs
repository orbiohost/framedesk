// PM2 process file. Start with: pm2 start ecosystem.config.cjs --env production
// The API is stateless, so "instances" can be raised once rate limiting uses Redis.
module.exports = {
  apps: [
    {
      name: 'framedesk-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env_production: { NODE_ENV: 'production' },
    },
  ],
};
