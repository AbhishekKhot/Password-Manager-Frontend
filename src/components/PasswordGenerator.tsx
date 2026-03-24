import { useState } from 'react';

interface Props {
  onGenerate: (password: string) => void;
}

export default function PasswordGenerator({ onGenerate }: Props) {
  const [length, setLength] = useState(16);
  
  const generate = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let pwd = "";
    const randomVals = new Uint32Array(length);
    window.crypto.getRandomValues(randomVals);
    
    for (let i = 0; i < length; i++) {
        pwd += chars[randomVals[i] % chars.length];
    }
    
    onGenerate(pwd);
  };

  return (
    <div className="password-generator">
      <div className="generator-header">
         <label>Length: {length}</label>
         <input 
            type="range" 
            min="8" 
            max="32" 
            value={length} 
            onChange={(e) => setLength(Number(e.target.value))} 
         />
      </div>
      <button type="button" onClick={generate} className="auth-button secondary generator-btn">
          Generate Strong Password
      </button>
    </div>
  );
}
