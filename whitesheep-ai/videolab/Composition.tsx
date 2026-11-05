import React from 'react';
import {AbsoluteFill, Audio, Composition, Img, interpolate, registerRoot, staticFile, useCurrentFrame} from 'remotion';

type Props = {title: string; subtitle: string; duration: number; narration: boolean; audioPath: string; imagePath: string};
const defaults: Props = {title:'Your next video', subtitle:'Replace this starter with your original composition.', duration:15, narration:false, audioPath:'', imagePath:''};
const Project: React.FC<Props> = ({title,subtitle,narration,audioPath,imagePath}) => {
  const frame=useCurrentFrame();
  const opacity=interpolate(frame,[0,12],[0,1],{extrapolateRight:'clamp'});
  return <AbsoluteFill style={{background:'#e9efed',color:imagePath?'white':'#173b3b',fontFamily:'DejaVu Sans, sans-serif',justifyContent:'center',padding:100}}>
    {imagePath && <><AbsoluteFill><Img src={staticFile(imagePath)} style={{width:'100%',height:'100%',objectFit:'cover'}}/></AbsoluteFill><AbsoluteFill style={{background:'rgba(0,0,0,0.48)'}}/></>}
    <div style={{opacity,position:'relative',transform:`translateY(${(1-opacity)*24}px)`}}>
      <div style={{fontSize:24,letterSpacing:4,marginBottom:40}}>LOCAL VIDEO STUDIO</div>
      <div style={{fontSize:84,fontWeight:800,lineHeight:1.08}}>{title}</div>
      <div style={{fontSize:36,lineHeight:1.4,marginTop:48}}>{subtitle}</div>
    </div>
    {narration&&<Audio src={staticFile(audioPath)}/>}
  </AbsoluteFill>;
};
registerRoot(()=> <Composition id="StudioProject" component={Project} width={1080} height={1920} fps={24} durationInFrames={360} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:Math.max(1,Math.round(props.duration*24))})}/>);
