// src/utils/logoHelper.js

let cachedLogo = null;

export const getLogoBase64 = async () => {
  if (cachedLogo) return cachedLogo;

  try {
    console.log('Fetching logo...');
    const response = await fetch('/evopay-logo.jpg');
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`Logo fetch failed with status: ${response.status}`);
    }

    const blob = await response.blob();
    console.log('Blob size:', blob.size);

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const dimensions = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });

    cachedLogo = { data: dataUrl, ...dimensions };
    console.log('Logo loaded successfully:', cachedLogo.width, 'x', cachedLogo.height);
    return cachedLogo;
  } catch (error) {
    console.error('Logo load error:', error);
    return null;
  }
};

export const getLogoUrl = () => {
  return '/evopay-logo.jpg';
};