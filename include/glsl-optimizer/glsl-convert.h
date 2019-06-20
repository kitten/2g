#include <stdbool.h>

#include "glsl/glsl_optimizer.h"
#include "sokol/sokol.h"

#if defined(SOKOL_GLCORE33)
  static enum glslopt_target target = kGlslTargetOpenGL;
#elif defined(SOKOL_GLES2)
  static enum glslopt_target target = kGlslTargetOpenGLES20;
#elif defined(SOKOL_GLES3)
  static enum glslopt_target target = kGlslTargetOpenGLES30;
#elif defined(SOKOL_METAL)
  static enum glslopt_target target = kGlslTargetMetal;
#else
  #error "The GLSL shader cross-transpiler only supports GLCORE33, GLES2, GLES3, or METAL"
#endif

static enum glslopt_options opts = kGlslOptionSkipPreprocessor;
static glslopt_ctx* ctx = NULL;

SOKOL_API_DECL const char* glsl_convert(char* source, enum glslopt_shader_type type);
SOKOL_API_DECL const char* glsl_convert_vertex(char* source);
SOKOL_API_DECL const char* glsl_convert_fragment(char* source);

/*-- IMPLEMENTATION --------------------------------------------------------*/
#ifdef SOKOL_IMPL

SOKOL_API_DECL const char* glsl_convert(char* source, enum glslopt_shader_type type) {
  if (ctx == NULL) {
    ctx = glslopt_initialize(target);
  }

  glslopt_shader* shader = glslopt_optimize(ctx, type, source, opts);

  const char* transformed = NULL;
  if (glslopt_get_status(shader)) {
    transformed = glslopt_get_output(shader);
  } else {
    SOKOL_LOG("Shader failed to compile!");
		SOKOL_LOG(glslopt_get_log(shader));
    SOKOL_ASSERT(false);
	}

  glslopt_shader_delete(shader);
  return transformed;
}

SOKOL_API_DECL const char* glsl_convert_vertex(char* source) {
  return glsl_convert(source, kGlslOptShaderVertex);
}

SOKOL_API_DECL const char* glsl_convert_fragment(char* source) {
  return glsl_convert(source, kGlslOptShaderFragment);
}

#endif /* SOKOL_IMPL */
