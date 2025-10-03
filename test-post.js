import fetch from 'node-fetch';

const response = await fetch('http://localhost:5002/api/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'hello',
  }),
});

const data = await response.json();
console.log(data);
