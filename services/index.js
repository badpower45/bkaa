/**
 * Services Index
 * Export all services for easy importing
 */

export { default as authService } from './authService.js';
export { default as productService } from './productService.js';
export { default as orderService } from './orderService.js';
export { default as cartService } from './cartService.js';

// Re-export individual functions for convenience
export * from './authService.js';
export * from './productService.js';
export * from './orderService.js';
export * from './cartService.js';
