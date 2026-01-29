import React, { createContext, ReactNode, useContext, useState } from 'react'

// Define your object type
export interface FileAttribute {
  allowDownload: boolean
  allowForward: boolean
  allowedTime: string
  FileDirectory: string
  oneTimeKey: string
}

interface FileAttributeContextType {
  sharedData: FileAttribute
  setSharedData: React.Dispatch<React.SetStateAction<FileAttribute>>
}

// Create context with TypeScript type
export const FileAttributeContext = createContext<
  FileAttributeContextType | undefined
>(undefined)

// Create the Provider component
interface SharedDataProviderProps {
  children: ReactNode
}

// Provider component
export const SharedDataProvider: React.FC<SharedDataProviderProps> = ({
  children,
}) => {
  console.log('SharedDataProvider rendered')
  const [sharedData, setSharedData] = useState<FileAttribute>({
    allowDownload: false,
    allowForward: false,
    allowedTime: '',
    FileDirectory: '',
    oneTimeKey: '',
  })

  return (
    <FileAttributeContext.Provider value={{ sharedData, setSharedData }}>
      {children}
    </FileAttributeContext.Provider>
  )
}

// Custom hook for consuming context
export function useSharedData() {
  console.log('useSharedData called')
  const context = useContext(FileAttributeContext)
  if (context === undefined) {
    throw new Error('useSharedData must be used within a FileAttributeProvider')
  }
  return context
}

// Optional variant: returns safe defaults when no provider is present.
export function useSharedDataOptional(): FileAttributeContextType {
  const context = useContext(FileAttributeContext)
  if (context === undefined) {
    return {
      sharedData: {
        allowDownload: false,
        allowForward: false,
        allowedTime: '',
        FileDirectory: '',
      },
      // no-op setter outside provider (typed as any)
      setSharedData: (() => {}) as any,
    }
  }
  return context
}

// // Usage in ComponentA (setting data)
// const ComponentA: React.FC = () => {
//   const { setSharedData } = useSharedData();

//   const handleClick = () => {
//     setSharedData({
//       id: 1,
//       name: 'Example',
//       value: { anything: 'you want' }
//     });
//   };

//   return <button onClick={handleClick}>Share Data</button>;
// };

// // Usage in ComponentB (getting data)
// const ComponentB: React.FC = () => {
//   const { sharedData } = useSharedData();

//   return <div>{sharedData?.name}</div>;
// };

// // Wrap your app with the provider
// function App() {
//   return (
//     <SharedDataProvider>
//       <ComponentA />
//       <ComponentB />
//     </SharedDataProvider>
//   );
// }
