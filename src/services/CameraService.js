// CameraService.js
// カメラアクセスと写真撮影機能を提供するサービスクラス

class CameraService {
    constructor() {
      this.stream = null;
      this.videoElement = null;
    }
  
    /**
     * カメラへのアクセスを取得し、ビデオプレビューを開始
     * @param {HTMLVideoElement} videoElement - ビデオ要素
     * @returns {Promise} - カメラアクセスのPromise
     */
    startCamera(videoElement) {
      this.videoElement = videoElement;
  
      // すでにアクティブなストリームがある場合は停止
      if (this.stream) {
        this.stopCamera();
      }
  
      // オプション設定 - バックカメラ（スマホの場合）優先に
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
  
      // カメラアクセスのリクエスト
      return navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          this.stream = stream;
          
          // video要素にストリームを設定
          this.videoElement.srcObject = stream;
          
          // 再生開始を待つ
          return new Promise(resolve => {
            this.videoElement.onloadedmetadata = () => {
              this.videoElement.play().then(resolve);
            };
          });
        })
        .catch(err => {
          console.error('カメラの起動に失敗しました:', err);
          throw new Error('カメラの起動に失敗しました: ' + err.message);
        });
    }
  
    /**
     * 現在のカメラ映像から写真を撮影
     * @returns {string|null} - Base64エンコードされた画像データ、または失敗時はnull
     */
    capturePhoto() {
      if (!this.stream || !this.videoElement) {
        console.error('カメラが起動していません');
        return null;
      }
  
      try {
        // 写真撮影用のキャンバスを作成
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // キャンバスのサイズを設定
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        // 現在のフレームを描画
        context.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        
        // JPEG形式でBase64エンコード
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch (err) {
        console.error('写真の撮影に失敗しました:', err);
        return null;
      }
    }
  
    /**
     * カメラストリームを停止
     */
    stopCamera() {
      if (this.stream) {
        // すべてのトラック（映像・音声）を停止
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
    }
  
    /**
     * カメラのデバイス一覧を取得（複数カメラ対応用）
     * @returns {Promise} - デバイス一覧のPromise
     */
    getCameraDevices() {
      return navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          // videoInputタイプのデバイスだけをフィルタリング
          return devices.filter(device => device.kind === 'videoinput');
        })
        .catch(err => {
          console.error('カメラデバイスの取得に失敗しました:', err);
          return [];
        });
    }
  
    /**
     * 特定のカメラデバイスを選択して起動
     * @param {string} deviceId - 起動するカメラのデバイスID
     * @param {HTMLVideoElement} videoElement - ビデオ要素
     * @returns {Promise} - カメラアクセスのPromise
     */
    selectCamera(deviceId, videoElement) {
      this.videoElement = videoElement;
  
      if (this.stream) {
        this.stopCamera();
      }
  
      const constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
  
      return navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          this.stream = stream;
          this.videoElement.srcObject = stream;
          
          return new Promise(resolve => {
            this.videoElement.onloadedmetadata = () => {
              this.videoElement.play().then(resolve);
            };
          });
        });
    }
  
    /**
     * カメラが利用可能かどうかをチェック
     * @returns {Promise<boolean>} - カメラが利用可能かどうかを返すPromise
     */
    checkCameraAvailability() {
      return navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          return devices.some(device => device.kind === 'videoinput');
        })
        .catch(() => {
          return false;
        });
    }
  }
  
  export default new CameraService();