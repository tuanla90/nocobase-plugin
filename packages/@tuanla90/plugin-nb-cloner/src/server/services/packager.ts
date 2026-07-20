import zlib from 'zlib';
import { BundleData } from './extractor';

// Magic bytes của gzip: 0x1F 0x8B
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

/**
 * Packager không dùng dependency ngoài.
 * Format: JSON bundle duy nhất, nén bằng gzip của Node.js built-in.
 * File output: .nbc.gz (NocoBase Clone bundle)
 */
export class Packager {
  /**
   * Serialize toàn bộ BundleData → JSON → gzip Buffer
   */
  async packToBuffer(bundle: BundleData): Promise<Buffer> {
    const json = JSON.stringify(bundle);
    return new Promise((resolve, reject) => {
      zlib.gzip(Buffer.from(json, 'utf8'), { level: 9 }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  /**
   * Giải nén gzip Buffer → BundleData.
   * Validate magic bytes trước khi gunzip để báo lỗi rõ ràng
   * thay vì để zlib throw "incorrect header check".
   */
  async unpackFromBuffer(gzBuffer: Buffer): Promise<BundleData> {
    // Kiểm tra magic bytes — phát hiện sớm file sai định dạng
    if (
      gzBuffer.length < 2 ||
      gzBuffer[0] !== GZIP_MAGIC[0] ||
      gzBuffer[1] !== GZIP_MAGIC[1]
    ) {
      throw new Error(
        'This is not a valid .nbc.gz file. ' +
        'Please upload a bundle produced by NB Cloner (with the .nbc.gz extension).',
      );
    }

    return new Promise((resolve, reject) => {
      zlib.gunzip(gzBuffer, (err, result) => {
        if (err) {
          reject(new Error(`Decompression failed: ${err.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(result.toString('utf8'));
          resolve(parsed as BundleData);
        } catch {
          reject(new Error('Corrupted bundle: JSON parse failed after decompression.'));
        }
      });
    });
  }
}
