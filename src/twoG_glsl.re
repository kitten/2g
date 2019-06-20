type glslTarget =
  | OpenGL
  | OpenGLES2
  | OpenGLES3
  | Metal;

external getTarget: unit => glslTarget = "tg_target";
external convertVertexShader: string => string = "tg_convert_vertex";
external convertFragmentShader: string => string = "tg_convert_fragment";
