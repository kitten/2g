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

external getTarget: unit => glslTarget = "tg_target";
external _getOutput: shaderT => string = "tg_get_output";

let getOutput = (shader: shaderT): string => {
  let str = _getOutput(shader);

  /* The version pragma needs to be fixed manually for GLES3 */
  let pragmaVersionRe = Str.regexp("#version 300 es");
  let pragmaVersionTarget = switch (getTarget()) {
  | OpenGL => "#version 330"
  | OpenGLES2 => "#version 200 es"
  | OpenGLES3 => "#version 300 es"
  | Metal => ""
  };

  Str.replace_first(pragmaVersionRe, pragmaVersionTarget, str);
};

external convertShader: (shaderType, string) => shaderT = "tg_convert_shader";
external getInputLength: shaderT => int = "tg_get_input_length";
external getUniformLength: shaderT => int = "tg_get_uniform_length";
external getTextureLength: shaderT => int = "tg_get_texture_length";
external getInputDesc: (shaderT, int) => shaderDescT = "tg_get_input_desc";
external getUniformDesc: (shaderT, int) => shaderDescT = "tg_get_uniform_desc";
external getTextureDesc: (shaderT, int) => shaderDescT = "tg_get_texture_desc";
