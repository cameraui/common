class AnsicolorMethods:
    start_code: str
    end_code: str

    def __init__(self, start_code: str, end_code: str = "39") -> None:
        self.start_code = start_code
        self.end_code = end_code

    def __call__(self, text: str) -> str:
        return f"\033[{self.start_code}m{text}\033[{self.end_code}m"


class Ansicolor:
    # Foreground colors
    default: AnsicolorMethods = AnsicolorMethods("39")
    white: AnsicolorMethods = AnsicolorMethods("97")
    black: AnsicolorMethods = AnsicolorMethods("30")
    red: AnsicolorMethods = AnsicolorMethods("31")
    green: AnsicolorMethods = AnsicolorMethods("32")
    yellow: AnsicolorMethods = AnsicolorMethods("33")
    blue: AnsicolorMethods = AnsicolorMethods("34")
    magenta: AnsicolorMethods = AnsicolorMethods("35")
    cyan: AnsicolorMethods = AnsicolorMethods("36")

    darkGray: AnsicolorMethods = AnsicolorMethods("90")
    lightGray: AnsicolorMethods = AnsicolorMethods("37")
    lightRed: AnsicolorMethods = AnsicolorMethods("91")
    lightGreen: AnsicolorMethods = AnsicolorMethods("92")
    lightYellow: AnsicolorMethods = AnsicolorMethods("93")
    lightBlue: AnsicolorMethods = AnsicolorMethods("94")
    lightMagenta: AnsicolorMethods = AnsicolorMethods("95")
    lightCyan: AnsicolorMethods = AnsicolorMethods("96")

    # Text styles
    bright: AnsicolorMethods = AnsicolorMethods("1", "22")
    dim: AnsicolorMethods = AnsicolorMethods("2", "22")
    italic: AnsicolorMethods = AnsicolorMethods("3", "23")
    underline: AnsicolorMethods = AnsicolorMethods("4", "24")
    inverse: AnsicolorMethods = AnsicolorMethods("7", "27")

    # Background colors
    bgDefault: AnsicolorMethods = AnsicolorMethods("49", "49")
    bgWhite: AnsicolorMethods = AnsicolorMethods("107", "49")
    bgBlack: AnsicolorMethods = AnsicolorMethods("40", "49")
    bgRed: AnsicolorMethods = AnsicolorMethods("41", "49")
    bgGreen: AnsicolorMethods = AnsicolorMethods("42", "49")
    bgYellow: AnsicolorMethods = AnsicolorMethods("43", "49")
    bgBlue: AnsicolorMethods = AnsicolorMethods("44", "49")
    bgMagenta: AnsicolorMethods = AnsicolorMethods("45", "49")
    bgCyan: AnsicolorMethods = AnsicolorMethods("46", "49")

    bgDarkGray: AnsicolorMethods = AnsicolorMethods("100", "49")
    bgLightGray: AnsicolorMethods = AnsicolorMethods("47", "49")
    bgLightRed: AnsicolorMethods = AnsicolorMethods("101", "49")
    bgLightGreen: AnsicolorMethods = AnsicolorMethods("102", "49")
    bgLightYellow: AnsicolorMethods = AnsicolorMethods("103", "49")
    bgLightBlue: AnsicolorMethods = AnsicolorMethods("104", "49")
    bgLightMagenta: AnsicolorMethods = AnsicolorMethods("105", "49")
    bgLightCyan: AnsicolorMethods = AnsicolorMethods("106", "49")


ansicolor: Ansicolor = Ansicolor()
