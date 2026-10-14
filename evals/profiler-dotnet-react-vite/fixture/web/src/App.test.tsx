import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('shows the title', () => {
  render(<App />);
  expect(screen.getByRole('heading').textContent).toBe('Shop');
});
