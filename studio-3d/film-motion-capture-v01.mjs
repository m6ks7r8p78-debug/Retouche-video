/** Repères de pose par image et retargeting de base pour Film Studio.
 * Entrée prévue pour un détecteur local MediaPipe Pose Landmarker.
 * Les coordonnées z d'une caméra seule restent relatives et ne sont pas une
 * reconstruction volumétrique mesurée.
 */
const SCHEMA='retoucheproai.film-pose-track.v0.1';
const BODY_POINTS=33;
const MIN_CONFIDENCE=.25;
const TRACKED={
 nose:0,leftEye:2,rightEye:5,leftEar:7,rightEar:8,
 leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,
 leftWrist:15,rightWrist:16,leftPinky:17,rightPinky:18,
 leftIndex:19,rightIndex:20,leftThumb:21,rightThumb:22,
 leftHip:23,rightHip:24,leftKnee:25,rightKnee:26,
 leftAnkle:27,rightAnkle:28,leftHeel:29,rightHeel:30,
 leftFoot:31,rightFoot:32
};
function validatePoseTrack(input){
 if(!input||input.schema!==SCHEMA||![24,25,30,60].includes(input.fps)||
  !Number.isInteger(input.width)||input.width<1||input.width>16384||
  !Number.isInteger(input.height)||input.height<1||input.height>16384||
  !Array.isArray(input.frames)||!input.frames.length||input.frames.length>108000)
  throw Error('Piste de pose absente ou incompatible.');
 let previous=-1;
 const frames=input.frames.map((frame,index)=>{
  if(!Number.isSafeInteger(frame.frame)||frame.frame<=previous||frame.frame>=108000||
   !Number.isFinite(frame.timeSeconds)||Math.abs(frame.timeSeconds-frame.frame/input.fps)>1/input.fps/2||
   !Array.isArray(frame.landmarks)||frame.landmarks.length!==BODY_POINTS)
   throw Error('Image ou chronologie de pose invalide (image '+index+').');
  previous=frame.frame;
  return {frame:frame.frame,timeSeconds:frame.timeSeconds,landmarks:frame.landmarks.map((p,i)=>{
   if(!p||![p.x,p.y,p.z,p.visibility].every(Number.isFinite)||p.visibility<0||p.visibility>1||
    Math.abs(p.x)>4||Math.abs(p.y)>4||Math.abs(p.z)>4)
    throw Error('Repère corporel invalide ('+i+'), image '+frame.frame+'.');
   return {x:p.x,y:p.y,z:p.z,visibility:p.visibility};
  })};
 });
 return Object.freeze({schema:SCHEMA,fps:input.fps,width:input.width,height:input.height,
  frames:Object.freeze(frames.map(Object.freeze)),source:'single_camera_2d_plus_relative_depth',
  calibrated3d:false});
}
function retargetPoseFrame(frame,{origin,heightMeters=1.7,confidence=MIN_CONFIDENCE}){
 if(!Array.isArray(origin)||origin.length!==3||origin.some(x=>!Number.isFinite(x))||
  !Number.isFinite(heightMeters)||heightMeters<.5||heightMeters>3||
  !Number.isFinite(confidence)||confidence<0||confidence>1)
  throw Error('Repère et échelle du personnage invalides.');
 const points={};
 for(const [name,index] of Object.entries(TRACKED)){
  const p=frame.landmarks[index];
  if(p.visibility<confidence){points[name]={visible:false,confidence:p.visibility};continue;}
  // x/y are image-normalized. z is relative to the camera and scaled by image width.
  points[name]={visible:true,confidence:p.visibility,position:[
   origin[0]+(p.x-.5)*heightMeters,
   origin[1]+(.5-p.y)*heightMeters,
   origin[2]-p.z*heightMeters
  ]};
 }
 return Object.freeze({frame:frame.frame,timeSeconds:frame.timeSeconds,points:Object.freeze(points),
  scaleSource:'user_selected_approximate_height',depthSource:'relative_single_camera_estimate',
  contactVerified:false});
}
export {SCHEMA,BODY_POINTS,MIN_CONFIDENCE,TRACKED,validatePoseTrack,retargetPoseFrame};
