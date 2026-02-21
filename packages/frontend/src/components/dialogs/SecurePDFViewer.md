# Secure PDF Viewer

## Overview

The Secure PDF Viewer is a secure, view-only PDF rendering component that ensures PDF data remains within the application and cannot be accessed by external applications or copied to the clipboard.

## Security Features

### 1. **Data Isolation**

- PDF files are rendered directly in the application using PDF.js
- No temporary files are created in user-accessible directories
- PDF data is never passed to external applications

### 2. **View-Only Mode**

- No copy/paste functionality from the PDF content
- No right-click context menu on PDF content
- No keyboard shortcuts for copying content
- No drag-and-drop of PDF content

### 3. **Application-Level Security**

- PDF rendering happens within the Electron app's sandbox
- Content protection prevents screenshots/screen capture (on supported platforms)
- No network access from the PDF viewer
- Strict Content Security Policy (CSP) headers

### 4. **Memory Management**

- PDF data is loaded into memory only when needed
- Automatic cleanup when the viewer is closed
- No persistent storage of PDF content

## Implementation Details

### Components

1. **SecurePDFViewer.tsx** - Main dialog component
2. **PDFViewer.tsx** - PDF rendering component using PDF.js
3. **\_secure-pdf-viewer.scss** - Styling for the viewer

### Integration Points

1. **messageFunctions.ts** - Updated to detect PDF files and route to secure viewer
2. **messageAttachment.tsx** - Updated to handle PDF attachments
3. **mediaAttachment.tsx** - Updated to handle PDF media files

### File Flow

1. User clicks on a `.prv` file attachment
2. `openAttachmentInShell` decrypts the file using the native library
3. If the decrypted file is a PDF, it returns `useSecureViewer: true`
4. The secure PDF viewer dialog is opened with the decrypted file path
5. PDF.js renders the PDF content in a canvas within the application
6. User can view, zoom, and navigate the PDF without data leaving the app

## Usage

The secure PDF viewer is automatically used when:

- A `.prv` file decrypts to a `.pdf` file
- A `.pdf` file is opened from within the application

The viewer provides:

- Page navigation (previous/next)
- Zoom controls (zoom in, zoom out, reset)
- Pan and zoom with mouse/touch gestures
- Page information display
- Secure viewer notice

## Security Considerations

### What's Protected

- PDF content cannot be copied to clipboard
- PDF content cannot be saved to external locations
- PDF content cannot be accessed by other applications
- Screenshots are prevented (on supported platforms)

### What's Not Protected

- Users can still take photos of their screen
- Users can still manually transcribe content
- Physical access to the device still allows access to the content

## Dependencies

- `pdfjs-dist` - PDF rendering library
- `react-zoom-pan-pinch` - Zoom and pan functionality
- Electron's content protection features

## Future Enhancements

1. **Watermarking** - Add user-specific watermarks to PDF content
2. **Audit Logging** - Log PDF viewing sessions
3. **Time-based Access** - Automatically close viewer after time limit
4. **Print Prevention** - Disable printing of PDF content
5. **Enhanced Zoom Controls** - Add fit-to-width, fit-to-page options
