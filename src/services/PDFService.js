// PDFService.js
// 画像をPDFに変換するサービスクラス

class PDFService {
  /**
   * 画像をPDFに変換
   * @param {string} imageData - Base64エンコードされた画像データ
   * @returns {Promise<Blob>} - PDFデータのBlob
   */
  async convertImageToPDF(imageData) {
    try {
      // jsPDFライブラリを使用してPDFを生成
      const { jsPDF } = await import('jspdf');
      
      // 画像をロード
      const img = new Image();
      img.src = imageData;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      
      // PDFのサイズを画像に合わせる
      const pdf = new jsPDF({
        orientation: img.width > img.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [img.width, img.height]
      });
      
      // 画像をPDFに追加
      pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
      
      // PDFをBlobとして返す
      return pdf.output('blob');
    } catch (error) {
      console.error('PDF変換に失敗しました:', error);
      throw new Error('PDF変換に失敗しました: ' + error.message);
    }
  }
}

export default new PDFService(); 