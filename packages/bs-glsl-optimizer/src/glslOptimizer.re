/* custom block of glslopt_shader */
type shaderT;

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

external getTarget: unit => glslTarget = "tg_target";
external convertShader: (shaderType, string) => shaderT = "tg_convert_shader";
external getOutput: shaderT => string = "tg_get_output";
