# 数学公式示例文档

本文档展示了MCP服务器对数学公式的支持能力。

## 1. 基础数学运算

### 1.1 行内公式

这是一个简单的行内公式：$x + y = z$，可以在句子中自然嵌入。

勾股定理：$a^2 + b^2 = c^2$

圆的面积公式：$S = \pi r^2$

### 1.2 行间公式（独立段落）

二次方程求根公式：

$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

欧拉公式：

$$e^{i\pi} + 1 = 0$$

## 2. 分数和根式

### 2.1 分数

简单分数：$\frac{1}{2}$

复杂分数：$\frac{x^2 + 2x + 1}{x - 1}$

嵌套分数：

$$\frac{1}{1 + \frac{1}{1 + \frac{1}{2}}}$$

### 2.2 根式

平方根：$\sqrt{2}$

立方根：$\sqrt[3]{8}$

复杂根式：$\sqrt{\frac{a + b}{c - d}}$

## 3. 上标和下标

### 3.1 上标（指数）

$x^2$, $x^{10}$, $2^n$

$e^{i\theta} = \cos\theta + i\sin\theta$

### 3.2 下标

$x_1$, $x_{12}$, $a_n$

数列：$a_1, a_2, a_3, ..., a_n$

### 3.3 上下标组合

$$\sum_{i=1}^{n} x_i$$

$$\lim_{x \to 0} \frac{\sin x}{x} = 1$$

## 4. 常用数学符号

### 4.1 希腊字母

- 小写：$\alpha$, $\beta$, $\gamma$, $\delta$, $\epsilon$, $\theta$, $\lambda$, $\mu$, $\pi$, $\sigma$, $\omega$
- 大写：$\Gamma$, $\Delta$, $\Theta$, $\Lambda$, $\Sigma$, $\Omega$

### 4.2 三角函数

$$\sin^2\theta + \cos^2\theta = 1$$

$$\tan\theta = \frac{\sin\theta}{\cos\theta}$$

### 4.3 对数和指数

自然对数：$\ln x$

常用对数：$\log_{10} x$

指数函数：$e^x$

## 5. 求和与积分

### 5.1 求和符号

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

$$\sum_{k=0}^{\infty} \frac{1}{2^k} = 2$$

### 5.2 积分符号

定积分：$\int_a^b f(x)dx$

不定积分：$\int f(x)dx$

## 6. 矩阵和方程组

简单的2×2矩阵表示：

$$\begin{matrix} a & b \\ c & d \end{matrix}$$

线性方程组：

$$\begin{cases}
x + y = 5 \\
2x - y = 1
\end{cases}$$

## 7. 复杂公式示例

### 7.1 泰勒级数

$$e^x = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + ...$$

### 7.2 正态分布

$$f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$$

### 7.3 傅里叶变换

$$F(\omega) = \int_{-\infty}^{\infty} f(t)e^{-i\omega t}dt$$

## 8. 实际应用示例

### 8.1 物理公式

能量守恒：$E = mc^2$

动能公式：$E_k = \frac{1}{2}mv^2$

### 8.2 统计公式

样本方差：$s^2 = \frac{1}{n-1}\sum_{i=1}^{n}(x_i - \bar{x})^2$

标准差：$\sigma = \sqrt{\frac{1}{N}\sum_{i=1}^{N}(x_i - \mu)^2}$

### 8.3 金融公式

复利计算：$A = P(1 + \frac{r}{n})^{nt}$

现值计算：$PV = \frac{FV}{(1+r)^n}$

## 总结

本文档展示了各种数学公式的表达方式，包括：

1. 行内公式和行间公式
2. 分数、根式、上下标
3. 希腊字母和特殊符号
4. 求和、积分等高级符号
5. 实际应用中的公式

通过MCP服务器的数学公式支持，可以方便地将包含复杂数学表达式的Markdown文档转换为格式化的Word文档。