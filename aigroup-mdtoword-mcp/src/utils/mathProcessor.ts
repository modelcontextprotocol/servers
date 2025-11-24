import {
  Math,
  MathRun,
  MathFraction,
  MathRadical,
  MathSuperScript,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathLimitUpper,
  MathLimitLower,
  MathFunction,
  MathSquareBrackets,
  MathRoundBrackets,
  MathCurlyBrackets,
  MathAngledBrackets,
  Paragraph
} from 'docx';

/**
 * 数学公式组件接口
 */
export interface MathComponent {
  type: 'run' | 'fraction' | 'radical' | 'superscript' | 'subscript' | 'subsuperscript' |
        'sum' | 'limit-upper' | 'limit-lower' | 'function' | 'square-brackets' |
        'round-brackets' | 'curly-brackets' | 'angled-brackets' | 'text';
  content?: string;
  children?: MathComponent[];
  numerator?: MathComponent[];
  denominator?: MathComponent[];
  degree?: MathComponent[];
  superScript?: MathComponent[];
  subScript?: MathComponent[];
  name?: string;
  limit?: MathComponent[];
}

/**
 * 数学公式配置接口
 */
export interface MathConfig {
  inline?: boolean; // 是否为行内公式
  fontSize?: number; // 字体大小
  fontFamily?: string; // 字体族
  color?: string; // 颜色
}

/**
 * LaTeX数学公式解析器
 * 将LaTeX数学表达式解析为AST结构
 */
export class MathParser {
  private position: number = 0;
  private text: string = '';

  /**
   * 解析LaTeX数学表达式
   */
  parse(latex: string): MathComponent[] {
    this.text = latex.trim();
    this.position = 0;
    const components: MathComponent[] = [];

    while (this.position < this.text.length) {
      const component = this.parseComponent();
      if (component) {
        components.push(component);
      }
    }

    return components;
  }

  private parseComponent(): MathComponent | null {
    this.skipWhitespace();

    if (this.position >= this.text.length) {
      return null;
    }

    const char = this.text[this.position];

    // 解析不同类型的数学组件
    if (char === '\\') {
      return this.parseCommand();
    } else if (char === '{') {
      return this.parseGroup();
    } else if (char === '^') {
      return this.parseSuperscript();
    } else if (char === '_') {
      return this.parseSubscript();
    } else if (char === '/') {
      return this.parseFraction();
    } else if (char === '√') {
      return this.parseRadical();
    } else if (char === '∑') {
      return this.parseSum();
    } else if (char === '∫') {
      return this.parseIntegral();
    } else if (char === 'π' || char === 'α' || char === 'β' || char === 'γ' ||
               char === 'δ' || char === 'ε' || char === 'ζ' || char === 'η' ||
               char === 'θ' || char === 'λ' || char === 'μ' || char === 'ν' ||
               char === 'ξ' || char === 'ρ' || char === 'σ' || char === 'τ' ||
               char === 'φ' || char === 'χ' || char === 'ψ' || char === 'ω') {
      return this.parseSymbol(char);
    } else if (char >= '0' && char <= '9' || char >= 'a' && char <= 'z' ||
               char >= 'A' && char <= 'Z') {
      return this.parseText();
    } else {
      // 跳过未知字符
      this.position++;
      return null;
    }
  }

  private parseCommand(): MathComponent | null {
    this.position++; // 跳过反斜杠

    if (this.position >= this.text.length) {
      return null;
    }

    const command = this.parseWord();

    switch (command) {
      case 'frac':
        return this.parseFractionCommand();
      case 'sqrt':
        return this.parseSqrtCommand();
      case 'sum':
        return this.parseSumCommand();
      case 'int':
        return this.parseIntegralCommand();
      case 'lim':
        return this.parseLimitCommand();
      case 'sin':
      case 'cos':
      case 'tan':
      case 'log':
      case 'ln':
        return this.parseFunctionCommand(command);
      case 'alpha':
      case 'beta':
      case 'gamma':
      case 'delta':
      case 'epsilon':
      case 'zeta':
      case 'eta':
      case 'theta':
      case 'lambda':
      case 'mu':
      case 'nu':
      case 'xi':
      case 'rho':
      case 'sigma':
      case 'tau':
      case 'phi':
      case 'chi':
      case 'psi':
      case 'omega':
      case 'pi':
        return this.parseSymbol('\\' + command);
      default:
        // 未知命令，当作普通文本处理
        return {
          type: 'text',
          content: '\\' + command
        };
    }
  }

  private parseWord(): string {
    let word = '';
    while (this.position < this.text.length) {
      const char = this.text[this.position];
      if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
        word += char;
        this.position++;
      } else {
        break;
      }
    }
    return word;
  }

  private parseGroup(): MathComponent | null {
    if (this.text[this.position] !== '{') {
      return null;
    }

    this.position++; // 跳过'{'
    const components: MathComponent[] = [];

    while (this.position < this.text.length && this.text[this.position] !== '}') {
      const component = this.parseComponent();
      if (component) {
        components.push(component);
      }
    }

    if (this.position < this.text.length && this.text[this.position] === '}') {
      this.position++; // 跳过'}'
    }

    return components.length === 1 ? components[0] : {
      type: 'text',
      content: components.map(c => this.componentToString(c)).join('')
    };
  }

  private parseSuperscript(): MathComponent | null {
    if (this.text[this.position] !== '^') {
      return null;
    }

    this.position++; // 跳过'^'

    const superscript = this.parseComponent();
    if (!superscript) {
      return null;
    }

    // 检查是否有基础组件（上标应该依附于某个组件）
    if (this.position > 0) {
      // 这里简化处理，实际应该追溯找到基础组件
      return {
        type: 'superscript',
        superScript: [superscript]
      };
    }

    return null;
  }

  private parseSubscript(): MathComponent | null {
    if (this.text[this.position] !== '_') {
      return null;
    }

    this.position++; // 跳过'_'

    const subscript = this.parseComponent();
    if (!subscript) {
      return null;
    }

    return {
      type: 'subscript',
      subScript: [subscript]
    };
  }

  private parseFraction(): MathComponent | null {
    if (this.text[this.position] !== '/') {
      return null;
    }

    this.position++; // 跳过'/'

    return {
      type: 'fraction',
      numerator: [{ type: 'text', content: '' }], // 简化处理
      denominator: [this.parseComponent() || { type: 'text', content: '' }]
    };
  }

  private parseFractionCommand(): MathComponent | null {
    // \frac{numerator}{denominator}
    const numerator: MathComponent[] = [];
    const denominator: MathComponent[] = [];

    // 解析分子
    if (this.text[this.position] === '{') {
      this.position++;
      while (this.position < this.text.length && this.text[this.position] !== '}') {
        const component = this.parseComponent();
        if (component) {
          numerator.push(component);
        }
      }
      if (this.position < this.text.length && this.text[this.position] === '}') {
        this.position++;
      }
    }

    // 解析分母
    if (this.position < this.text.length && this.text[this.position] === '{') {
      this.position++;
      while (this.position < this.text.length && this.text[this.position] !== '}') {
        const component = this.parseComponent();
        if (component) {
          denominator.push(component);
        }
      }
      if (this.position < this.text.length && this.text[this.position] === '}') {
        this.position++;
      }
    }

    return {
      type: 'fraction',
      numerator,
      denominator
    };
  }

  private parseSqrtCommand(): MathComponent | null {
    const children: MathComponent[] = [];

    // 可选的度数（如立方根）
    let degree: MathComponent[] | undefined;

    // 检查是否有度数
    if (this.position < this.text.length && this.text[this.position] === '[') {
      this.position++;
      while (this.position < this.text.length && this.text[this.position] !== ']') {
        const component = this.parseComponent();
        if (component) {
          if (!degree) degree = [];
          degree.push(component);
        }
      }
      if (this.position < this.text.length && this.text[this.position] === ']') {
        this.position++;
      }
    }

    // 解析被开方数
    if (this.position < this.text.length && this.text[this.position] === '{') {
      this.position++;
      while (this.position < this.text.length && this.text[this.position] !== '}') {
        const component = this.parseComponent();
        if (component) {
          children.push(component);
        }
      }
      if (this.position < this.text.length && this.text[this.position] === '}') {
        this.position++;
      }
    }

    return {
      type: 'radical',
      children,
      degree
    };
  }

  private parseSumCommand(): MathComponent | null {
    const children: MathComponent[] = [];

    // 解析上下限
    let subScript: MathComponent[] | undefined;
    let superScript: MathComponent[] | undefined;

    // 检查是否有上下限
    if (this.position < this.text.length && this.text[this.position] === '_') {
      this.position++;
      if (this.text[this.position] === '{') {
        this.position++;
        while (this.position < this.text.length && this.text[this.position] !== '}') {
          const component = this.parseComponent();
          if (component) {
            if (!subScript) subScript = [];
            subScript.push(component);
          }
        }
        if (this.position < this.text.length && this.text[this.position] === '}') {
          this.position++;
        }
      }
    }

    if (this.position < this.text.length && this.text[this.position] === '^') {
      this.position++;
      if (this.text[this.position] === '{') {
        this.position++;
        while (this.position < this.text.length && this.text[this.position] !== '}') {
          const component = this.parseComponent();
          if (component) {
            if (!superScript) superScript = [];
            superScript.push(component);
          }
        }
        if (this.position < this.text.length && this.text[this.position] === '}') {
          this.position++;
        }
      }
    }

    return {
      type: 'sum',
      children,
      subScript,
      superScript
    };
  }

  private parseIntegralCommand(): MathComponent | null {
    // 简化为普通文本处理
    return {
      type: 'text',
      content: '∫'
    };
  }

  private parseLimitCommand(): MathComponent | null {
    const limit: MathComponent[] = [];

    // 解析极限表达式
    if (this.position < this.text.length && this.text[this.position] === '{') {
      this.position++;
      while (this.position < this.text.length && this.text[this.position] !== '}') {
        const component = this.parseComponent();
        if (component) {
          limit.push(component);
        }
      }
      if (this.position < this.text.length && this.text[this.position] === '}') {
        this.position++;
      }
    }

    return {
      type: 'limit-upper',
      limit
    };
  }

  private parseFunctionCommand(name: string): MathComponent | null {
    const children: MathComponent[] = [];

    // 解析函数参数
    if (this.position < this.text.length && this.text[this.position] === '{') {
      this.position++;
      while (this.position < this.text.length && this.text[this.position] !== '}') {
        const component = this.parseComponent();
        if (component) {
          children.push(component);
        }
      }
      if (this.position < this.text.length && this.text[this.position] === '}') {
        this.position++;
      }
    }

    return {
      type: 'function',
      name,
      children
    };
  }

  private parseRadical(): MathComponent | null {
    this.position++; // 跳过根号符号

    const children: MathComponent[] = [];

    // 解析被开方数
    while (this.position < this.text.length) {
      const component = this.parseComponent();
      if (component) {
        children.push(component);
      } else {
        break;
      }
    }

    return {
      type: 'radical',
      children
    };
  }

  private parseSum(): MathComponent | null {
    this.position++; // 跳过求和符号

    return {
      type: 'sum',
      children: []
    };
  }

  private parseIntegral(): MathComponent | null {
    this.position++; // 跳过积分符号

    return {
      type: 'text',
      content: '∫'
    };
  }

  private parseSymbol(symbol: string): MathComponent {
    this.position++;
    return {
      type: 'text',
      content: symbol
    };
  }

  private parseText(): MathComponent {
    let text = '';

    while (this.position < this.text.length) {
      const char = this.text[this.position];

      if (char === '\\' || char === '{' || char === '}' ||
          char === '^' || char === '_' || char === '/' ||
          char === '√' || char === '∑' || char === '∫') {
        break;
      }

      text += char;
      this.position++;
    }

    return {
      type: 'text',
      content: text
    };
  }

  private skipWhitespace(): void {
    while (this.position < this.text.length && /\s/.test(this.text[this.position])) {
      this.position++;
    }
  }

  private componentToString(component: MathComponent): string {
    switch (component.type) {
      case 'text':
        return component.content || '';
      case 'fraction':
        return `\\frac{${component.numerator?.map(c => this.componentToString(c)).join('') || ''}}{${component.denominator?.map(c => this.componentToString(c)).join('') || ''}}`;
      case 'radical':
        return `\\sqrt${component.degree ? `[${component.degree.map(c => this.componentToString(c)).join('')}]` : ''}{${component.children?.map(c => this.componentToString(c)).join('') || ''}}`;
      case 'superscript':
        return `^{${component.superScript?.map(c => this.componentToString(c)).join('') || ''}}`;
      case 'subscript':
        return `_{${component.subScript?.map(c => this.componentToString(c)).join('') || ''}}`;
      case 'sum':
        return `\\sum${component.subScript ? `_${component.subScript.map(c => this.componentToString(c)).join('')}` : ''}${component.superScript ? `^${component.superScript.map(c => this.componentToString(c)).join('')}` : ''}`;
      default:
        return '';
    }
  }
}

/**
 * docx数学组件转换器
 * 将数学组件AST转换为docx数学对象
 */
export class MathConverter {
  /**
   * 将数学组件数组转换为docx数学对象数组
   */
  static convertComponents(components: MathComponent[], config?: MathConfig): any[] {
    const result: any[] = [];

    for (const component of components) {
      const mathObj = this.convertComponent(component, config);
      if (mathObj) {
        result.push(mathObj);
      }
    }

    return result;
  }

  /**
   * 将单个数学组件转换为docx数学对象
   */
  static convertComponent(component: MathComponent, config?: MathConfig): any | null {
    switch (component.type) {
      case 'text':
      case 'run':
        return this.createMathRun(component.content || '', config);

      case 'fraction':
        return new MathFraction({
          numerator: this.convertComponents(component.numerator || [], config),
          denominator: this.convertComponents(component.denominator || [], config)
        });

      case 'radical':
        return new MathRadical({
          children: this.convertComponents(component.children || [], config),
          degree: component.degree ? this.convertComponents(component.degree, config) : undefined
        });

      case 'superscript':
        return new MathSuperScript({
          children: component.children ? this.convertComponents(component.children, config) : [this.createMathRun('', config)],
          superScript: this.convertComponents(component.superScript || [], config)
        });

      case 'subscript':
        return new MathSubScript({
          children: component.children ? this.convertComponents(component.children, config) : [this.createMathRun('', config)],
          subScript: this.convertComponents(component.subScript || [], config)
        });

      case 'subsuperscript':
        return new MathSubSuperScript({
          children: this.convertComponents(component.children || [], config),
          superScript: this.convertComponents(component.superScript || [], config),
          subScript: this.convertComponents(component.subScript || [], config)
        });

      case 'sum':
        return new MathSum({
          children: this.convertComponents(component.children || [], config),
          subScript: component.subScript ? this.convertComponents(component.subScript, config) : undefined,
          superScript: component.superScript ? this.convertComponents(component.superScript, config) : undefined
        });

      case 'limit-upper':
        return new MathLimitUpper({
          children: this.convertComponents(component.children || [], config),
          limit: this.convertComponents(component.limit || [], config)
        });

      case 'limit-lower':
        return new MathLimitLower({
          children: this.convertComponents(component.children || [], config),
          limit: this.convertComponents(component.limit || [], config)
        });

      case 'function':
        return new MathFunction({
          name: this.convertComponents(component.name ? [{ type: 'text', content: component.name }] : [], config),
          children: this.convertComponents(component.children || [], config)
        });

      case 'square-brackets':
        return new MathSquareBrackets({
          children: this.convertComponents(component.children || [], config)
        });

      case 'round-brackets':
        return new MathRoundBrackets({
          children: this.convertComponents(component.children || [], config)
        });

      case 'curly-brackets':
        return new MathCurlyBrackets({
          children: this.convertComponents(component.children || [], config)
        });

      case 'angled-brackets':
        return new MathAngledBrackets({
          children: this.convertComponents(component.children || [], config)
        });

      default:
        console.warn(`未知的数学组件类型: ${component.type}`);
        return null;
    }
  }

  /**
   * 创建数学文本运行对象
   */
  private static createMathRun(text: string, config?: MathConfig): MathRun {
    return new MathRun(text);
  }
}

/**
 * 数学公式处理器主类
 */
export class MathProcessor {
  private parser: MathParser;

  constructor() {
    this.parser = new MathParser();
  }

  /**
   * 处理Markdown数学公式文本
   * 支持行内公式 $...$ 和行间公式 $$...$$
   */
  processMathInMarkdown(markdown: string): { processed: string; mathBlocks: Array<{latex: string; startIndex: number; endIndex: number; inline: boolean}> } {
    const mathBlocks: Array<{latex: string; startIndex: number; endIndex: number; inline: boolean}> = [];
    let processed = markdown;

    // 匹配行间公式 $$...$$
    const blockRegex = /\$\$([^$]+)\$\$/g;
    processed = processed.replace(blockRegex, (match, latex, offset) => {
      mathBlocks.push({
        latex: latex.trim(),
        startIndex: offset,
        endIndex: offset + match.length,
        inline: false
      });
      return `[MATH_BLOCK_${mathBlocks.length - 1}]`;
    });

    // 匹配行内公式 $...$
    const inlineRegex = /\$([^$]+)\$/g;
    processed = processed.replace(inlineRegex, (match, latex, offset) => {
      // 跳过已经在数学块中的公式
      const adjustedOffset = offset + match.length;
      const isInMathBlock = mathBlocks.some(block =>
        offset >= block.startIndex && offset < block.endIndex
      );

      if (!isInMathBlock) {
        mathBlocks.push({
          latex: latex.trim(),
          startIndex: offset,
          endIndex: adjustedOffset,
          inline: true
        });
        return `[MATH_INLINE_${mathBlocks.length - 1}]`;
      }

      return match;
    });

    return { processed, mathBlocks };
  }

  /**
   * 将LaTeX数学公式转换为docx数学对象
   */
  convertLatexToDocx(latex: string, config?: MathConfig): Math | null {
    try {
      const components = this.parser.parse(latex);
      const mathChildren = MathConverter.convertComponents(components, config);

      if (mathChildren.length === 0) {
        return null;
      }

      return new Math({
        children: mathChildren
      });
    } catch (error) {
      console.error('数学公式转换失败:', error);
      return null;
    }
  }

  /**
   * 检查文本是否包含数学公式
   */
  containsMath(text: string): boolean {
    const blockRegex = /\$\$([^$]+)\$\$/;
    const inlineRegex = /\$([^$]+)\$/;
    return blockRegex.test(text) || inlineRegex.test(text);
  }

  /**
   * 提取文本中的数学公式
   */
  extractMathExpressions(text: string): Array<{expression: string; start: number; end: number; type: 'inline' | 'block'}> {
    const expressions: Array<{expression: string; start: number; end: number; type: 'inline' | 'block'}> = [];

    // 提取行间公式
    const blockRegex = /\$\$([^$]+)\$\$/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      expressions.push({
        expression: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'block'
      });
    }

    // 提取行内公式
    const inlineRegex = /\$([^$]+)\$/g;
    while ((match = inlineRegex.exec(text)) !== null) {
      expressions.push({
        expression: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'inline'
      });
    }

    return expressions;
  }
}