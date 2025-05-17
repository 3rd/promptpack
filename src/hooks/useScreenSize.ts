import { useCallback, useEffect, useState } from "react";
import { useStdout } from "ink";

export const useScreenSize = () => {
  const { stdout } = useStdout();
  const getSize = useCallback(
    () => ({
      height: stdout.rows,
      width: stdout.columns,
    }),
    [stdout]
  );
  const [size, setSize] = useState(getSize);

  useEffect(() => {
    const onResize = () => setSize(getSize());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [getSize, stdout]);

  return size;
};
