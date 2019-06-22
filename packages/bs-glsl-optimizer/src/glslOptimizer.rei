/* glslopt_shader_type */
type shaderType =
  | Vertex
  | Fragment;

/* glslopt_target */
type glslTarget =
  | OpenGL
  | OpenGLES2
  | OpenGLES3
  | Metal;

/* glslopt_basic_type */
type basicType =
  | Float
  | Int
  | Bool
  | Tex2D
  | Tex3D
  | Cube
  | Shadow2D
  | Array2D
  | Other
  | Count;

/* glslopt_precision */
type precision =
  | High
  | Medium
  | Low
  | Count;

/* custom block of glslopt_shader */
type shaderT;

/* record for shader values */
type shaderDescT = {
  name: string,
  basicType: basicType,
  precision: precision,
  vectorSize: int,
  matrixSize: int,
  arraySize: int,
  location: int
};

let convertShader: (shaderType, string) => shaderT;
let getInputLength: shaderT => int;
let getUniformLength: shaderT => int;
let getTextureLength: shaderT => int;
let getInputDesc: (shaderT, int) => shaderDescT;
let getUniformDesc: (shaderT, int) => shaderDescT;
let getTextureDesc: (shaderT, int) => shaderDescT;
let getOutput: shaderT => string;
