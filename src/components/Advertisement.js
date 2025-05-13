import React, { useEffect } from 'react';

const Advertisement = ({ adSlot, format = 'auto', style = {} }) => {
  useEffect(() => {
    try {
      // AdSenseの広告を初期化
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{
        display: 'block',
        ...style
      }}
      data-ad-client="ca-pub-YOUR_PUBLISHER_ID"
      data-ad-slot={adSlot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
};

export default Advertisement; 