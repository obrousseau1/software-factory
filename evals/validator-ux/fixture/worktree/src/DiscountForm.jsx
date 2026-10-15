import { useState } from 'react';
import { applyDiscount } from './discount.js';

export function DiscountForm({ total }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(total);
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    try { setResult(applyDiscount(total, code)); setError(null); } catch { /* ignore */ }
  };
  return (
    <form onSubmit={submit}>
      <input placeholder="code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button type="submit">Apply</button>
      {error && <p role="alert">{error}</p>}
      <p>Total: {result}</p>
    </form>
  );
}
