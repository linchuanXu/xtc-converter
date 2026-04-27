#ifndef FT_COMPAT_H
#define FT_COMPAT_H

#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_TRUETYPE_TABLES_H

#ifndef FT_SFNT_OS2
#define FT_SFNT_OS2 ft_sfnt_os2
#endif

#ifndef FT_SFNT_HEAD
#define FT_SFNT_HEAD ft_sfnt_head
#endif

#if FREETYPE_MAJOR < 2 || (FREETYPE_MAJOR == 2 && FREETYPE_MINOR < 10)
static inline const char* FT_Error_String(FT_Error error) {
    (void)error;
    return NULL;
}
#endif

#endif
