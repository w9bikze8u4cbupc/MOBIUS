import('./src/api/index.js')
  .then(() => {
    console.log('Syntax is correct');
  })
  .catch((err) => {
    console.error('Syntax error:', err);
  });
