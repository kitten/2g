#include <assert.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>

#include <emscripten.h>
#include <emscripten/bind.h>

#include "glsl/glsl_optimizer.h"

using namespace emscripten;

struct ShaderDesc {
  std::string name;
  int type;
  int prec;
  int vecSize;
  int matSize;
  int arrSize;
  int location;
};

static glslopt_ctx* ctx = NULL;
static enum glslopt_options opts = kGlslOptionSkipPreprocessor;
static enum glslopt_target target = kGlslTargetOpenGLES30;

int tg_target() {
  return target;
}

class Shader {
private:
  glslopt_shader* shader;

public:
  Shader(int type, std::string source) {
    if (ctx == NULL) {
      ctx = glslopt_initialize(target);
    }

    char* str = const_cast<char*>(source.c_str());
    glslopt_shader_type glslopt_type = (glslopt_shader_type) type;
    shader = glslopt_optimize(ctx, glslopt_type, str, opts);
    if (!glslopt_get_status(shader)) {
      puts("Shader failed to compile!");
      puts(glslopt_get_log(shader));
      assert(false);
    }
  }

  static int get_target() {
    return target;
  }

  const std::string get_output() {
    return glslopt_get_output((glslopt_shader*) shader);
  }

  int get_input_length() {
    return glslopt_shader_get_input_count(shader);
  }

  int get_uniform_length() {
    return glslopt_shader_get_uniform_count(shader);
  }

  int get_texture_length() {
    return glslopt_shader_get_texture_count(shader);
  }

  ShaderDesc get_input_desc(int index) {
    const char* name;
    enum glslopt_basic_type type;
    enum glslopt_precision prec;
    int vecSize, matSize, arrSize, location;

    glslopt_shader_get_input_desc(
      shader, index,
      &name, &type, &prec, &vecSize, &matSize, &arrSize, &location
    );

    ShaderDesc desc = {
      .name = name,
      .type = (int) type,
      .prec = (int) prec,
      .vecSize = vecSize,
      .matSize = matSize,
      .arrSize = arrSize,
      .location = location,
    };

    return desc;
  }

  ShaderDesc get_uniform_desc(int index) {
    const char* name;
    enum glslopt_basic_type type;
    enum glslopt_precision prec;
    int vecSize, matSize, arrSize, location;

    glslopt_shader_get_uniform_desc(
      shader, index,
      &name, &type, &prec, &vecSize, &matSize, &arrSize, &location
    );

    ShaderDesc desc = {
      .name = name,
      .type = (int) type,
      .prec = (int) prec,
      .vecSize = vecSize,
      .matSize = matSize,
      .arrSize = arrSize,
      .location = location,
    };

    return desc;
  }

  ShaderDesc get_texture_desc(int index) {
    const char* name;
    enum glslopt_basic_type type;
    enum glslopt_precision prec;
    int vecSize, matSize, arrSize, location;

    glslopt_shader_get_texture_desc(
      shader, index,
      &name, &type, &prec, &vecSize, &matSize, &arrSize, &location
    );

    ShaderDesc desc = {
      .name = name,
      .type = (int) type,
      .prec = (int) prec,
      .vecSize = vecSize,
      .matSize = matSize,
      .arrSize = arrSize,
      .location = location,
    };

    return desc;
  }
};

EMSCRIPTEN_BINDINGS(glsl_optimizer) {
  value_array<ShaderDesc>("ShaderDesc")
    .element(&ShaderDesc::name)
    .element(&ShaderDesc::type)
    .element(&ShaderDesc::prec)
    .element(&ShaderDesc::vecSize)
    .element(&ShaderDesc::matSize)
    .element(&ShaderDesc::arrSize)
    .element(&ShaderDesc::location);

  class_<Shader>("Shader")
    .constructor<int, std::string>()
    .function("get_output", &Shader::get_output)
    .function("get_input_length", &Shader::get_input_length)
    .function("get_uniform_length", &Shader::get_uniform_length)
    .function("get_texture_length", &Shader::get_texture_length)
    .function("get_input_desc", &Shader::get_input_desc)
    .function("get_uniform_desc", &Shader::get_uniform_desc)
    .function("get_texture_desc", &Shader::get_texture_desc)
    .class_function("get_target", &Shader::get_target);
}
