# Responsible Gambling MCP

An MCP (Model Context Protocol) server that provides tools for responsible gambling budget calculation and habit assessment. This tool helps users make informed financial decisions about gambling and promotes safe, enjoyable gaming practices.

![Responsible Gambling](https://img.shields.io/badge/responsible-gambling-blue)
![MCP](https://img.shields.io/badge/MCP-compatible-green)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

### 🧮 Budget Calculator
- Calculate safe gambling budgets based on financial situation
- Determine daily, weekly, and monthly limits
- Identify warning flags in spending patterns
- Aligned with responsible gambling best practices

### 📊 Habit Assessment
- Evaluate gambling frequency and patterns
- Assess risk level (Low, Moderate, High)
- Receive personalized recommendations
- Identify potential problem gambling indicators

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/wolfbetcomcasino-prog/responsible-gambling-mcp.git
cd responsible-gambling-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### Running the Server

```bash
npm start
```

Or with development mode:
```bash
npm run dev
```

### Using with Claude

Add to your Claude configuration file (`~/.claude/config.json`):

```json
{
  "mcpServers": {
    "responsible-gambling": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

### Available Tools

#### 1. `calculate_gambling_budget`

Calculate a safe gambling budget based on your financial situation.

**Parameters:**
- `monthly_income` (number): Your monthly net income (after taxes)
- `fixed_expenses` (number): Total fixed monthly expenses (rent, utilities, insurance, etc.)
- `emergency_fund` (number): Current balance in emergency fund
- `savings_goals` (number): Monthly amount allocated to savings goals
- `entertainment_budget` (number): Total monthly entertainment budget

**Example:**
```
monthly_income: 3000
fixed_expenses: 1500
emergency_fund: 9000
savings_goals: 300
entertainment_budget: 300
```

**Output includes:**
- Recommended monthly gambling budget
- Daily limit
- Weekly limit
- Warning flags if any conditions detected

#### 2. `assess_gambling_habits`

Assess your gambling habits and receive personalized recommendations.

**Parameters:**
- `frequency` (string): How often you gamble (never, rarely, monthly, weekly, several-times-weekly, daily)
- `exceeded_intention` (boolean): Have you gambled more than intended?
- `attempted_cutback` (boolean): Have you tried to cut back?
- `gambles_for_escape` (boolean): Do you gamble to escape problems?

**Output includes:**
- Risk level assessment (Low, Moderate, High)
- Personalized recommendations
- Links to support resources

## Responsible Gambling Principles

This tool is built on these core principles:

1. **Never gamble with money you need for essentials** - Rent, food, and utilities must never be at risk
2. **Set limits and stick to them** - Once your daily limit is reached, stop playing
3. **Never chase losses** - Accept losses as entertainment costs, not debts
4. **Keep emergency funds intact** - Gambling should never impact your financial safety net
5. **Seek help if needed** - Problem gambling is treatable

## Support Resources

If you or someone you know is struggling with gambling:

- **GamCare** (UK): https://www.gamcare.org.uk/
- **National Council on Problem Gambling (NCPG)** (US): https://www.ncpg.org/
- **Gamblers Anonymous**: https://www.gamblersanonymous.org/
- **Wolfbet Responsible Gambling Guide**: https://wolfbet.com/blog/responsible-gambling-how-much-money-can-you-afford-to-spend-on-casino-entertainment/

## Compliance

This tool is designed to support:
- UK Gambling Commission guidelines
- Malta Gaming Authority regulations
- Responsible gambling best practices
- Financial health and wellbeing

## Technical Details

- **Language:** TypeScript
- **Runtime:** Node.js 18+
- **MCP Version:** Compatible with MCP 1.0+
- **Protocol:** Stdio-based transport

## Development

### Project Structure
```
responsible-gambling-mcp/
├── src/
│   └── index.ts              # Main MCP server implementation
├── dist/                     # Compiled JavaScript (generated)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── LICENSE                   # MIT License
└── README.md                 # This file
```

### Building

```bash
npm run build
```

### Development with watch mode

```bash
npm run watch
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

**Wolfbet** - Promoting responsible gaming since 2024

---

## Disclaimer

This tool is provided for educational and planning purposes. It is not financial or psychological advice. If you believe you have a gambling problem, please seek help from professional resources listed above. Gambling should only be done with money you can afford to lose and should never impact your financial wellbeing.

## Changelog

### v1.0.0 (2024)
- Initial release
- Budget calculator with warning flags
- Gambling habits assessment tool
- Integration with responsible gambling resources
