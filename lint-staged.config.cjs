module.exports = {
  "*.{js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{ts,tsx}": ["eslint --fix", "prettier --write", "tsc --noEmit --pretty false"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
};
