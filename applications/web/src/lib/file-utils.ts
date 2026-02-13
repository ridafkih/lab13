const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function isAllowedImageType(value: string): value is AllowedImageType {
  return ALLOWED_IMAGE_TYPES.some((allowedType) => allowedType === value);
}

export function validateImageFile(file: File): ValidationResult {
  if (!isAllowedImageType(file.type)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Allowed types: JPEG, PNG, GIF, WebP`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size ${sizeMB}MB exceeds maximum of 10MB`,
    };
  }

  return { valid: true };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as base64"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function isImageFile(file: File): boolean {
  return isAllowedImageType(file.type);
}
