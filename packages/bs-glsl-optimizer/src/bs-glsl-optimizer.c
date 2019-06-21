#include <assert.h>
#include <stdio.h>
#include <stdbool.h>

#include <caml/memory.h>
#include <caml/alloc.h>
#include <caml/mlvalues.h>

#include "glsl/glsl_optimizer.h"

#if defined(__APPLE__)
  static enum glslopt_target target = kGlslTargetMetal;
#else
  static enum glslopt_target target = kGlslTargetOpenGL;
#endif

static enum glslopt_options opts = kGlslOptionSkipPreprocessor;
static glslopt_ctx* ctx = NULL;

int glsl_target() {
  return target;
}

const char* glsl_convert(char* source, enum glslopt_shader_type type) {
  if (ctx == NULL) {
    ctx = glslopt_initialize(target);
  }

  glslopt_shader* shader = glslopt_optimize(ctx, type, source, opts);

  const char* transformed = NULL;
  if (glslopt_get_status(shader)) {
    transformed = glslopt_get_output(shader);
  } else {
    puts("Shader failed to compile!");
		puts(glslopt_get_log(shader));
    assert(false);
	}

  glslopt_shader_delete(shader);
  return transformed;
}

const char* glsl_convert_vertex(char* source) {
  return glsl_convert(source, kGlslOptShaderVertex);
}

const char* glsl_convert_fragment(char* source) {
  return glsl_convert(source, kGlslOptShaderFragment);
}

CAMLprim value tg_target() {
  return Val_int(glsl_target());
}

CAMLprim value tg_convert_vertex(value vs) {
  CAMLparam1(vs);
  char* vs_opt = (char*) glsl_convert_vertex(String_val(vs));
  return caml_copy_string(vs_opt);
}

CAMLprim value tg_convert_fragment(value fs) {
  CAMLparam1(fs);
  char* fs_opt = (char*) glsl_convert_fragment(String_val(fs));
  return caml_copy_string(fs_opt);
}
