// Class ids of the selfie_multiclass_256x256 segmenter (MediaPipe Image Segmenter
// guide): 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 others
// (accessories such as caps and glasses). Kept in a tiny module so pure analysis
// code can use them without loading the segmenter runtime.

export const CLASSES = Object.freeze({ BACKGROUND: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHERS: 5 });
export const CLASS_COUNT = 6;
