#define SOKOL_IMPL
#include "sokol.h"
#include "glsl-optimizer/glsl-convert.h"

#if defined(SOKOL_GLCORE33)||defined(SOKOL_GLES2)||defined(SOKOL_GLES3)
  void loadGraphics() {
    gladLoadGL();
  }
#else
  void loadGraphics() {}
#endif
