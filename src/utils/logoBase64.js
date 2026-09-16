let cachedLogo = null;

export const getLogoBase64 = async () => {
  if (cachedLogo) return cachedLogo;

  try {
    const response = await fetch('/evopay-logo.jpg');
    if (!response.ok) {
      throw new Error(`Logo fetch failed with status: ${response.status}`);
    }

    const blob = await response.blob();

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
    return cachedLogo;
  } catch (error) {
    console.error('Logo load error:', error);
    return null;
  }
};