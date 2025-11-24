import { ImageStyle } from '../types/style.js';
import { ImageRun } from 'docx';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * 图片处理器类
 * 负责图片的加载、格式识别、尺寸计算等
 */
export class ImageProcessor {
  private static readonly DEFAULT_MAX_WIDTH = 600; // 默认最大宽度（缇）
  private static readonly DEFAULT_MAX_HEIGHT = 800; // 默认最大高度（缇）
  private static readonly DEFAULT_ASPECT_RATIO = 0.667; // 默认宽高比 (2:3)

  /**
   * 支持的图片格式
   */
  private static readonly SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];

  /**
   * 加载图片数据
   * @param src 图片路径
   * @param baseDir Markdown文件所在目录，用于解析相对路径
   */
  static async loadImageData(src: string, baseDir?: string): Promise<{ data: Buffer | string; type: string | null; error?: string }> {
    try {
      if (src.startsWith('data:')) {
        // Base64图片
        const base64Parts = src.split('base64,');
        if (base64Parts.length < 2) {
          return { data: Buffer.from(''), type: null, error: 'Base64格式错误' };
        }
        const type = this.getImageTypeFromDataUrl(src);
        return { data: base64Parts[1], type };
      } else if (src.startsWith('http')) {
        // 网络图片
        try {
          const response = await fetch(src);
          if (!response.ok) {
            return { data: Buffer.from(''), type: null, error: `HTTP ${response.status}` };
          }
          const arrayBuffer = await response.arrayBuffer();
          const data = Buffer.from(arrayBuffer);
          const type = this.getImageTypeFromUrl(src);
          return { data, type };
        } catch (fetchError) {
          return { data: Buffer.from(''), type: null, error: '网络连接失败' };
        }
      } else {
        // 本地图片 - 需要基于baseDir解析相对路径
        let resolvedPath = src;
        
        // 如果提供了baseDir且src是相对路径，则基于baseDir解析
        if (baseDir && !path.isAbsolute(src)) {
          resolvedPath = path.resolve(baseDir, src);
          console.log(`   📁 [路径解析] 相对路径: ${src}`);
          console.log(`   📁 [路径解析] 基础目录: ${baseDir}`);
          console.log(`   📁 [路径解析] 解析后路径: ${resolvedPath}`);
        }
        
        if (!fs.existsSync(resolvedPath)) {
          console.error(`   ❌ [路径解析] 文件不存在: ${resolvedPath}`);
          return { data: Buffer.from(''), type: null, error: `文件不存在: ${resolvedPath}` };
        }
        
        try {
          const data = fs.readFileSync(resolvedPath);
          // 重要：使用解析后的路径来获取图片类型！
          const type = this.getImageTypeFromUrl(resolvedPath);
          console.log(`   ✅ [路径解析] 文件读取成功，大小: ${data.length} 字节，类型: ${type}`);
          return { data, type };
        } catch (readError) {
          console.error(`   ❌ [路径解析] 文件读取失败:`, readError);
          return { data: Buffer.from(''), type: null, error: '文件读取失败' };
        }
      }
    } catch (error) {
      return { data: Buffer.from(''), type: null, error: '图片加载失败' };
    }
  }

  /**
   * 从Data URL识别图片类型
   */
  private static getImageTypeFromDataUrl(src: string): string | null {
    if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) return 'jpg';
    if (src.startsWith('data:image/png')) return 'png';
    if (src.startsWith('data:image/gif')) return 'gif';
    if (src.startsWith('data:image/bmp')) return 'bmp';
    if (src.startsWith('data:image/svg+xml')) return 'svg';
    if (src.startsWith('data:image/webp')) return 'webp';
    return null;
  }

  /**
   * 从URL识别图片类型
   */
  private static getImageTypeFromUrl(src: string): string | null {
    // 处理特殊域名
    if (src.includes('mdn.alipayobjects.com')) {
      return 'png';
    }
    if (src.includes('unsplash.com') || src.includes('placeholder.com')) {
      return 'jpg';
    }

    // 检查文件扩展名
    const urlWithoutQuery = src.split('?')[0];
    const ext = urlWithoutQuery.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'jpg':
      case 'jpeg': return 'jpg';
      case 'png': return 'png';
      case 'gif': return 'gif';
      case 'bmp': return 'bmp';
      case 'svg': return 'svg';
      case 'webp': return 'webp';
      default: return null;
    }
  }

  /**
   * 计算图片尺寸
   * 考虑最大尺寸限制和宽高比保持
   */
  static calculateDimensions(
    originalWidth?: number,
    originalHeight?: number,
    imageStyle?: ImageStyle
  ): { width: number; height: number } {
    const maintainAspectRatio = imageStyle?.maintainAspectRatio !== false;
    const maxWidth = imageStyle?.maxWidth || this.DEFAULT_MAX_WIDTH;
    const maxHeight = imageStyle?.maxHeight || this.DEFAULT_MAX_HEIGHT;

    // 如果明确指定了宽高，直接使用
    if (imageStyle?.width && imageStyle?.height) {
      return { width: imageStyle.width, height: imageStyle.height };
    }

    // 如果只指定了宽度
    if (imageStyle?.width && !imageStyle?.height) {
      const width = Math.min(imageStyle.width, maxWidth);
      const height = maintainAspectRatio
        ? Math.round(width * (originalHeight && originalWidth ? originalHeight / originalWidth : this.DEFAULT_ASPECT_RATIO))
        : Math.min(width * this.DEFAULT_ASPECT_RATIO, maxHeight);
      return { width, height };
    }

    // 如果只指定了高度
    if (imageStyle?.height && !imageStyle?.width) {
      const height = Math.min(imageStyle.height, maxHeight);
      const width = maintainAspectRatio
        ? Math.round(height * (originalWidth && originalHeight ? originalWidth / originalHeight : 1 / this.DEFAULT_ASPECT_RATIO))
        : Math.min(height / this.DEFAULT_ASPECT_RATIO, maxWidth);
      return { width, height };
    }

    // 使用默认尺寸
    const defaultWidth = Math.min(400, maxWidth);
    const defaultHeight = Math.min(defaultWidth * this.DEFAULT_ASPECT_RATIO, maxHeight);
    return { width: defaultWidth, height: defaultHeight };
  }

  /**
   * 验证图片格式是否支持
   */
  static isSupportedFormat(type: string | null, allowedFormats?: string[]): boolean {
    if (!type) return false;
    const formats = allowedFormats || this.SUPPORTED_FORMATS;
    return formats.includes(type.toLowerCase());
  }

  /**
   * 创建占位符SVG
   */
  static createPlaceholderSvg(
    width: number,
    height: number,
    errorMessage: string,
    alt: string,
    src: string
  ): Buffer {
    const placeholderSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#f0f0f0" stroke="#cccccc" stroke-width="2"/>
        <text x="50%" y="40%" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666666">
          图片无法加载
        </text>
        <text x="50%" y="50%" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999999">
          ${errorMessage}
        </text>
        <text x="50%" y="60%" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#999999">
          ${alt}
        </text>
        <text x="50%" y="70%" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#bbbbbb">
          ${src.length > 50 ? src.substring(0, 47) + '...' : src}
        </text>
      </svg>
    `;
    return Buffer.from(placeholderSvg, 'utf-8');
  }

  /**
   * 转换毫米到缇
   */
  static convertMillimetersToTwip(mm: number): number {
    return Math.round(mm * 56.692);
  }

  /**
   * 转换缇到毫米
   */
  static convertTwipToMillimeters(twip: number): number {
    return Math.round(twip / 56.692);
  }
}