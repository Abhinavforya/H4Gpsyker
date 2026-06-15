import React, {useMemo} from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Simple ASCII generator: map each char to a small pattern or replicate char
function textToAsciiLines(text, width=40){
  const base = text.split('\n').join(' ')
  const padded = (' '+base+' ').repeat(10).slice(0, Math.max(base.length, width))
  const lines = []
  for(let r=0;r<12;r++){
    const start = r*3 % padded.length
    const slice = padded.slice(start, start+Math.floor(width/ (1 + (r%4))))
    lines.push(slice.padEnd(width, ' '))
  }
  return lines
}

const container = {
  hidden: { opacity: 0 },
  visible: i => ({
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.05 * i }
  })
}

const charV = {
  hidden: { opacity: 0, y: 6, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale:1 }
}

export default function AsciiArt({text='H4G', mode='text'}){
  const lines = useMemo(()=>textToAsciiLines(text, 48), [text, mode])

  return (
    <div className="ascii-wrap">
      <AnimatePresence>
        <motion.div className="ascii-container" variants={container} initial="hidden" animate="visible" custom={1}>
          {lines.map((line, i)=> (
            <motion.div className="ascii-line" key={i} style={{whiteSpace:'pre'}}>
              {Array.from(line).map((ch, j)=> (
                <motion.span className="ascii-char" key={j} variants={charV}>
                  {ch}
                </motion.span>
              ))}
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
